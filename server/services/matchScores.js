import { MatchEvent, Player } from "../models/index.js";
// Own goals credit the opposite team. Assists never change the match score.
export function tallyGoals(match, events, players) {
  const byId = new Map(players.map((p) => [String(p._id), p]));
  const home = String(match.homeTeam._id || match.homeTeam);
  const score = { homeScore: 0, awayScore: 0 };
  for (const event of events) {
    if (!["goal", "ownGoal"].includes(event.type)) continue;
    const player = byId.get(String(event.player));
    if (!player) continue;
    const isHome = String(player.team) === home;
    const homeCredit = event.type === "ownGoal" ? !isHome : isHome;
    score[homeCredit ? "homeScore" : "awayScore"]++;
  }
  return score;
}
export async function withFinalScores(matches, { force = false } = {}) {
  const finalized = matches.filter((m) => force || m.status === "completed");
  if (!finalized.length)
    return matches.map((m) => (m.toObject ? m.toObject() : m));
  const events = await MatchEvent.find({
    match: { $in: finalized.map((m) => m._id) },
    type: { $in: ["goal", "ownGoal"] },
  }).lean();
  const players = await Player.find({
    _id: { $in: events.map((e) => e.player) },
  })
    .select("team")
    .lean();
  return matches.map((m) => {
    const result = m.toObject ? m.toObject() : m;
    return force || m.status === "completed"
      ? {
          ...result,
          ...tallyGoals(
            m,
            events.filter((e) => String(e.match) === String(m._id)),
            players,
          ),
        }
      : result;
  });
}
