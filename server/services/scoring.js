import {
  FantasySquad,
  Match,
  MatchEvent,
  Player,
  Team,
} from "../models/index.js";
export function scoreEvents(events, players, rules) {
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
export function scoreSquad(squad, breakdown, rules) {
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
