import { z } from "zod";
import { auth } from "../middleware/auth.js";
import { check } from "../services/rules.js";
import {
  livePerformance,
  matchPerformance,
  performance,
} from "../services/scoring.js";
import { Match } from "../models/index.js";
import {
  send,
  id,
  page,
  find,
  visible,
  privateTournament,
  squadDisclosureAllowed,
} from "../services/resources.js";

function combinedPerformanceRows(finalized, live) {
  const rows = finalized.rows.map((row) => {
    const user = String(row.user);
    const liveDetails = live.details.get(user) || [];
    const detailsByPlayer = new Map(
      row.details.map((detail) => [String(detail.player), detail]),
    );
    for (const detail of liveDetails) {
      const current = detailsByPlayer.get(detail.player);
      if (!current) continue;
      current.base += detail.base;
      current.points += detail.points;
      current.events = [...(current.events || []), ...detail.events];
    }
    const livePoints = live.points.get(user) || 0;
    return {
      ...row,
      points: row.points + livePoints,
      finalizedPoints: row.points,
      livePoints,
      provisional: live.matchesCounted > 0,
      liveMatchesCounted: live.matchesCounted,
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

export function registerPerformanceRoutes(app) {
  app.get("/api/matches/:matchId/live-performance", async (req, res) => {
    const match = await find(Match, req.params.matchId);
    const tournament = await visible(String(match.tournament), req);
    send(res, {
      status: match.status,
      provisional: match.status === "live",
      rows: ["live", "completed"].includes(match.status)
        ? await matchPerformance(match, tournament)
        : [],
    });
  });

  app.get(
    "/api/tournaments/:tournamentId/squad-disclosure",
    privateTournament,
    async (req, res) =>
      send(res, {
        allowed: await squadDisclosureAllowed(req.tournament),
      }),
  );

  app.get(
    "/api/tournaments/:tournamentId/leaderboard",
    privateTournament,
    async (req, res) => {
      const p = await performance(req.tournament);
      const live = await livePerformance(req.tournament);
      const rows = combinedPerformanceRows(p, live);
      const search = req.query.name
        ? z.string().trim().max(80).parse(req.query.name)
        : "";
      const filteredRows = search
        ? rows.filter((row) =>
            row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
          )
        : rows;
      const { skip, limit } = page(req);
      send(
        res,
        filteredRows
          .slice(skip, skip + limit)
          .map(({ details, ...row }) => row),
      );
    },
  );

  app.get(
    "/api/tournaments/:tournamentId/managers/:userId/squad",
    privateTournament,
    async (req, res) => {
      id.parse(req.params.userId);
      check(
        await squadDisclosureAllowed(req.tournament),
        "Manager squads are private until rosters are locked and no match is live",
        409,
      );
      const row = (await performance(req.tournament)).rows.find(
        (manager) => String(manager.user) === req.params.userId,
      );
      check(row, "Manager squad not found in this tournament", 404);
      send(res, row);
    },
  );

  app.get(
    "/api/tournaments/:tournamentId/my-performance",
    auth,
    async (req, res) => {
      const t = await visible(req.params.tournamentId);
      const p = await performance(t);
      const live = await livePerformance(t);
      const rows = combinedPerformanceRows(p, live);
      send(
        res,
        rows.find((r) => String(r.user) === String(req.user._id)) || null,
      );
    },
  );

  app.get(
    "/api/tournaments/:tournamentId/players/:playerId/performance",
    privateTournament,
    async (req, res) => {
      id.parse(req.params.playerId);
      const p = await performance(req.tournament);
      const row = p.players.find((p) => String(p._id) === req.params.playerId);
      check(row, "Player not in tournament", 404);
      send(res, row);
    },
  );
}
