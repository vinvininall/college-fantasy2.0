import { z } from "zod";
import { Tournament, FantasySquad, Match } from "../models/index.js";
import { auth, admin } from "../middleware/auth.js";
import { check, tournamentSchema } from "../services/rules.js";

import { send, page, find, privateTournament } from "../services/resources.js";
import { mutate } from "../middleware/mutations.js";

export function registerTournamentsRoutes(app) {
  app.get("/api/tournaments", async (req, res) => {
    send(
      res,
      await Tournament.find({ status: { $ne: "draft" } })
        .sort({ createdAt: -1 })
        .skip(page(req).skip)
        .limit(page(req).limit),
    );
  });

  app.get("/api/admin/tournaments", auth, admin, async (req, res) =>
    send(
      res,
      await Tournament.find()
        .sort({ createdAt: -1 })
        .skip(page(req).skip)
        .limit(page(req).limit),
    ),
  );

  mutate(app, "post", "/api/tournaments", auth, admin, async (req, res) => {
    const v = tournamentSchema.parse(req.body);
    send(
      res,
      await Tournament.create({
        ...v,
        playersPerSide: parseInt(v.format),
        creator: req.user._id,
      }),
      201,
    );
  });

  app.get("/api/tournaments/:tournamentId", privateTournament, (req, res) =>
    send(res, req.tournament),
  );

  mutate(
    app,
    "put",
    "/api/tournaments/:tournamentId",
    auth,
    admin,
    async (req, res) => {
      const t = await find(Tournament, req.params.tournamentId);
      check(
        t.status !== "completed",
        "Completed tournaments are read-only",
        409,
      );
      const v = tournamentSchema.parse(req.body);
      const used =
        (await FantasySquad.exists({ tournament: t._id })) ||
        (await Match.exists({ tournament: t._id }));
      if (used) {
        for (const key of [
          "format",
          "budget",
          "squadSize",
          "startingPlayers",
          "substitutes",
          "formations",
          "formationPolicy",
          "scoring",
        ])
          check(
            JSON.stringify(t.toObject()[key]) === JSON.stringify(v[key]),
            "Rules are locked after squads or fixtures exist",
            409,
          );
      }
      Object.assign(t, v, { playersPerSide: parseInt(v.format) });
      send(res, await t.save());
    },
  );

  mutate(
    app,
    "patch",
    "/api/tournaments/:tournamentId/status",
    auth,
    admin,
    async (req, res) => {
      const t = await find(Tournament, req.params.tournamentId);
      const { status } = z
        .object({
          status: z.enum(["draft", "upcoming", "active", "completed"]),
        })
        .strict()
        .parse(req.body);
      const next = {
        draft: "upcoming",
        upcoming: "active",
        active: "completed",
      };
      check(
        next[t.status] === status,
        "Lifecycle must advance draft → upcoming → active → completed",
        409,
      );
      if (status === "completed")
        check(
          !(await Match.exists({
            tournament: t._id,
            status: { $in: ["scheduled", "live"] },
          })),
          "Complete or cancel outstanding fixtures first",
          409,
        );
      t.status = status;
      send(res, await t.save());
    },
  );
}
