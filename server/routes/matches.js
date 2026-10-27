import { withFinalScores } from "../services/matchScores.js";
import { z } from "zod";
import { Team, Match, MatchEvent } from "../models/index.js";
import { auth, admin } from "../middleware/auth.js";
import { check } from "../services/rules.js";

import {
  send,
  id,
  page,
  find,
  visible,
  privateTournament,
  mutable,
} from "../services/resources.js";
import { mutate } from "../middleware/mutations.js";

export function registerMatchesRoutes(app) {
  const fixtureSchema = z
    .object({
      homeTeam: id,
      awayTeam: id,
      scheduledAt: z.iso.datetime({ offset: true }),
      venue: z.string().max(200).default(""),
    })
    .strict();

  async function fixtureTeams(v, t) {
    check(v.homeTeam !== v.awayTeam, "A team cannot play itself");
    check(
      (await Team.countDocuments({
        _id: { $in: [v.homeTeam, v.awayTeam] },
        tournament: t,
      })) === 2,
      "Both teams must belong to this tournament",
    );
  }

  app.get(
    "/api/tournaments/:tournamentId/matches",
    privateTournament,
    async (req, res) => {
      const filter = { tournament: req.tournament._id };
      if (req.query.status)
        filter.status = z
          .enum(["scheduled", "live", "completed", "cancelled"])
          .parse(req.query.status);
      if (req.query.team) {
        id.parse(req.query.team);
        const team = await find(Team, req.query.team);
        check(
          String(team.tournament) === String(req.tournament._id),
          "Team is outside tournament",
        );
        filter.$or = [{ homeTeam: team._id }, { awayTeam: team._id }];
      }
      send(
        res,
        await withFinalScores(
          await Match.find(filter)
            .populate("homeTeam awayTeam", "name shortName")
            .sort({ scheduledAt: 1 })
            .skip(page(req).skip)
            .limit(page(req).limit),
        ),
      );
    },
  );

  mutate(
    app,
    "post",
    "/api/tournaments/:tournamentId/matches",
    auth,
    admin,
    async (req, res) => {
      const t = await mutable(req.params.tournamentId);
      const v = fixtureSchema.parse(req.body);
      await fixtureTeams(v, t._id);
      check(
        new Date(v.scheduledAt) > new Date(),
        "New fixtures must be in the future",
      );
      send(
        res,
        await Match.create({
          ...v,
          tournament: t._id,
          homeScore: 0,
          awayScore: 0,
        }),
        201,
      );
    },
  );

  app.get("/api/matches/:matchId", async (req, res) => {
    const m = await find(Match, req.params.matchId);
    await visible(String(m.tournament), req);
    send(
      res,
      (
        await withFinalScores([
          await m.populate("homeTeam awayTeam", "name shortName"),
        ])
      )[0],
    );
  });

  mutate(app, "put", "/api/matches/:matchId", auth, admin, async (req, res) => {
    const m = await find(Match, req.params.matchId);
    await mutable(m.tournament);
    check(
      m.status === "scheduled" && !(await MatchEvent.exists({ match: m._id })),
      "Only scheduled matches without events can be edited",
      409,
    );
    const v = fixtureSchema.parse(req.body);
    await fixtureTeams(v, m.tournament);
    check(
      new Date(v.scheduledAt) > new Date(),
      "Fixture must be in the future",
    );
    Object.assign(m, v);
    send(res, await m.save());
  });

  mutate(
    app,
    "put",
    "/api/matches/:matchId/result",
    auth,
    admin,
    async (req, res) => {
      const m = await find(Match, req.params.matchId);
      const t = await mutable(m.tournament);
      const v = z
        .object({
          status: z.enum(["live", "completed", "cancelled"]),
          homeScore: z.number().int().min(0).max(1000),
          awayScore: z.number().int().min(0).max(1000),
        })
        .strict()
        .parse(req.body);
      check(
        v.status === "cancelled" || t.status === "active",
        "Activate tournament before recording results",
        409,
      );
      check(m.status !== "cancelled", "Cancelled matches are immutable", 409);
      if (m.status === "completed")
        check(
          v.status === "completed",
          "Finalized matches only allow score corrections",
          409,
        );
      if (v.status === "cancelled")
        check(
          !(await MatchEvent.exists({ match: m._id })),
          "Remove events before cancellation",
          409,
        );
      if (v.status === "cancelled")
        check(
          v.homeScore === 0 && v.awayScore === 0,
          "Cancelled scores must be zero",
        );
      if (v.status === "completed") {
        const [score] = await withFinalScores([m], { force: true });
        check(
          v.homeScore === score.homeScore && v.awayScore === score.awayScore,
          `Final score must match recorded goals (${score.homeScore} : ${score.awayScore}). Record or correct goal events first.`,
        );
      }
      Object.assign(m, v);
      send(res, await m.save());
    },
  );
}
