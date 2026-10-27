import { z } from "zod";
import { auth } from "../middleware/auth.js";
import { check } from "../services/rules.js";
import { matchPerformance, performance } from "../services/scoring.js";
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
      const search = req.query.name
        ? z.string().trim().max(80).parse(req.query.name)
        : "";
      const rows = search
        ? p.rows.filter((row) =>
            row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
          )
        : p.rows;
      const { skip, limit } = page(req);
      send(
        res,
        rows.slice(skip, skip + limit).map(({ details, ...row }) => row),
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
