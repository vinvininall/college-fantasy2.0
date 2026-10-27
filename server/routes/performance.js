import { auth } from "../middleware/auth.js";
import { check } from "../services/rules.js";
import { performance } from "../services/scoring.js";
import {
  send,
  id,
  page,
  visible,
  privateTournament,
} from "../services/resources.js";

export function registerPerformanceRoutes(app) {
  app.get(
    "/api/tournaments/:tournamentId/leaderboard",
    privateTournament,
    async (req, res) => {
      const p = await performance(req.tournament);
      send(
        res,
        p.rows
          .slice(page(req).skip, page(req).skip + page(req).limit)
          .map(({ details, ...r }) => r),
      );
    },
  );

  app.get(
    "/api/tournaments/:tournamentId/my-performance",
    auth,
    async (req, res) => {
      const t = await visible(req.params.tournamentId);
      const p = await performance(t);
      send(
        res,
        p.rows.find((r) => String(r.user) === String(req.user._id)) || null,
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
