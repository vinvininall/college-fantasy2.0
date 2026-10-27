import {
  FantasySquad,
  Match,
  MatchEvent,
  Player,
  Team,
} from "../models/index.js";
import { scoringDefaults } from "./rules.js";

export function scoringRules(rules = {}) {
  const resolved = Object.fromEntries(
    Object.keys(scoringDefaults)
      .filter((key) => key !== "goal")
      .map((key) => [key, rules[key] ?? scoringDefaults[key]]),
  );
  return {
    ...resolved,
    goal: Object.fromEntries(
      Object.keys(scoringDefaults.goal).map((position) => [
        position,
        rules.goal?.[position] ?? scoringDefaults.goal[position],
      ]),
    ),
  };
}

export function scoreEvents(events, players, rules) {
  rules = scoringRules(rules);
  const result = {};
  const byId = new Map(players.map((p) => [String(p._id), p]));
  for (const e of events) {
    const id = String(e.player);
    const p = byId.get(id);
    if (!p) continue;
    const points = e.type === "goal" ? rules.goal[p.position] : rules[e.type];
    const row = (result[id] ||= {
      player: id,
      name: p.name,
      position: p.position,
      points: 0,
      events: [],
    });
    row.points += points;
    row.events.push({
      type: e.type,
      minute: e.minute,
      points,
      match: String(e.match),
    });
  }
  return result;
}
export async function matchPerformance(match, tournament) {
  const [events, players, squads] = await Promise.all([
    MatchEvent.find({ match: match._id }).lean(),
    Player.find({
      team: { $in: [match.homeTeam, match.awayTeam] },
    }).lean(),
    FantasySquad.find({ tournament: tournament._id, complete: true })
      .populate("user", "name")
      .lean(),
  ]);
  const breakdown = scoreEvents(events, players, tournament.scoring);
  const playerById = new Map(
    players.map((player) => [String(player._id), player]),
  );
  const rows = squads.map((squad) => {
    const details = scoreSquad(
      squad,
      breakdown,
      scoringRules(tournament.scoring),
    )
      .map((row) => ({
        ...row,
        name: playerById.get(row.player)?.name,
      }))
      .filter((row) => row.base !== 0);
    return {
      user: String(squad.user._id),
      name: squad.user.name,
      points: details.reduce((sum, row) => sum + row.points, 0),
      details,
    };
  });
  rows.sort(
    (a, b) =>
      b.points - a.points || String(a.user).localeCompare(String(b.user)),
  );
  rows.forEach(
    (row, index) =>
      (row.rank =
        index && rows[index - 1].points === row.points
          ? rows[index - 1].rank
          : index + 1),
  );
  return rows;
}

export function scoreSquad(squad, breakdown, rules) {
  rules = scoringRules(rules);
  return squad.players.map((id) => {
    id = String(id);
    const starter = squad.starters.some((s) => String(s) === id);
    const multiplier = !starter
      ? 0
      : String(squad.captain) === id
        ? rules.captain
        : String(squad.viceCaptain) === id
          ? rules.viceCaptain
          : 1;
    const base = breakdown[id]?.points || 0;
    return {
      ...breakdown[id],
      player: id,
      base,
      multiplier,
      role: !starter
        ? "bench"
        : String(squad.captain) === id
          ? "captain"
          : String(squad.viceCaptain) === id
            ? "vice-captain"
            : "starter",
      points: base * multiplier,
    };
  });
}
export async function performance(t) {
  const matches = await Match.find({
    tournament: t._id,
    status: "completed",
  }).lean();
  const teams = await Team.find({ tournament: t._id }).distinct("_id");
  const [events, players, squads] = await Promise.all([
    MatchEvent.find({ match: { $in: matches.map((m) => m._id) } }).lean(),
    Player.find({ team: { $in: teams } }).lean(),
    FantasySquad.find({ tournament: t._id, complete: true })
      .populate("user", "name")
      .lean(),
  ]);
  const breakdown = scoreEvents(events, players, t.scoring);
  const playerById = new Map(players.map((p) => [String(p._id), p]));
  const matchBreakdowns = new Map(
    matches.map((m) => [
      String(m._id),
      scoreEvents(
        events.filter((e) => String(e.match) === String(m._id)),
        players,
        t.scoring,
      ),
    ]),
  );
  const rows = squads
    .map((s) => {
      const details = scoreSquad(s, breakdown, t.scoring).map((r) => ({
        ...r,
        name: playerById.get(r.player)?.name,
      }));
      return {
        squad: s._id,
        user: s.user._id,
        name: s.user.name,
        points: details.reduce((sum, r) => sum + r.points, 0),
        details,
        matchesCounted: matches.length,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points || String(a.user).localeCompare(String(b.user)),
    );
  rows.forEach(
    (r, i) =>
      (r.rank =
        i && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1),
  );
  return {
    rows,
    players: players.map((p) => ({
      ...p,
      ...breakdown[String(p._id)],
      matches: matches.map((m) => ({
        match: m._id,
        scheduledAt: m.scheduledAt,
        points: matchBreakdowns.get(String(m._id))[String(p._id)]?.points || 0,
      })),
    })),
    matchesCounted: matches.length,
  };
}

export async function livePerformance(t) {
  const matches = await Match.find({
    tournament: t._id,
    status: "live",
  }).lean();
  if (!matches.length)
    return {
      matchesCounted: 0,
      points: new Map(),
      details: new Map(),
    };

  const [teams, events, squads] = await Promise.all([
    Team.find({ tournament: t._id }).distinct("_id"),
    MatchEvent.find({
      match: { $in: matches.map((match) => match._id) },
    }).lean(),
    FantasySquad.find({ tournament: t._id, complete: true }).lean(),
  ]);
  const players = await Player.find({ team: { $in: teams } }).lean();
  const eventsByMatch = new Map(
    matches.map((match) => [String(match._id), []]),
  );
  for (const event of events)
    eventsByMatch.get(String(event.match))?.push(event);
  const breakdowns = [...eventsByMatch].map(([matchId, matchEvents]) => [
    matchId,
    scoreEvents(matchEvents, players, t.scoring),
  ]);
  const points = new Map();
  const details = new Map();
  const rules = scoringRules(t.scoring);
  const playerById = new Map(
    players.map((player) => [String(player._id), player]),
  );
  for (const squad of squads) {
    const user = String(squad.user);
    const playerDetails = new Map(
      squad.players.map((id) => {
        const playerId = String(id);
        const player = playerById.get(playerId);
        const starter = squad.starters.some(
          (starterId) => String(starterId) === playerId,
        );
        const role = !starter
          ? "bench"
          : String(squad.captain) === playerId
            ? "captain"
            : String(squad.viceCaptain) === playerId
              ? "vice-captain"
              : "starter";
        return [
          playerId,
          {
            player: playerId,
            name: player?.name,
            position: player?.position,
            base: 0,
            multiplier: !starter
              ? 0
              : role === "captain"
                ? rules.captain
                : role === "vice-captain"
                  ? rules.viceCaptain
                  : 1,
            role,
            points: 0,
            events: [],
          },
        ];
      }),
    );
    for (const [, breakdown] of breakdowns) {
      for (const score of scoreSquad(squad, breakdown, rules)) {
        const detail = playerDetails.get(score.player);
        detail.base += score.base;
        detail.points += score.points;
        detail.events.push(...(score.events || []));
      }
    }
    const squadDetails = [...playerDetails.values()];
    points.set(
      user,
      squadDetails.reduce((total, detail) => total + detail.points, 0),
    );
    details.set(user, squadDetails);
  }
  return { matchesCounted: matches.length, points, details };
}
