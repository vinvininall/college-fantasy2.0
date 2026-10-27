import { z } from "zod";
import {
  Tournament,
  Team,
  Player,
  FantasySquad,
  Match,
} from "../models/index.js";
import { auth, admin } from "../middleware/auth.js";
import { check, validateSquad } from "../services/rules.js";

import { send, id, page, find } from "../services/resources.js";
import { mutate } from "../middleware/mutations.js";

export function registerSquadsRoutes(app) {
  const squadSchema = z
    .object({
      players: z.array(id).max(100),
      starters: z.array(id).max(100),
      captain: id.nullable().optional(),
      viceCaptain: id.nullable().optional(),
      complete: z.boolean(),
      version: z.number().int().min(0).optional(),
    })
    .strict();

  async function squadOpen(t) {
    check(
      t.status === "upcoming" && t.registrationEnabled,
      "Squad registration is closed",
      409,
    );
    check(
      !(await Match.exists({
        tournament: t._id,
        status: { $ne: "cancelled" },
        scheduledAt: { $lte: new Date() },
      })),
      "Squads locked at first kickoff",
      409,
    );
  }

  app.get("/api/tournaments/:tournamentId/my-squad", auth, async (req, res) => {
    await find(Tournament, req.params.tournamentId);
    send(
      res,
      await FantasySquad.findOne({
        user: req.user._id,
        tournament: req.params.tournamentId,
      }),
    );
  });

  mutate(
    app,
    "put",
    "/api/tournaments/:tournamentId/my-squad",
    auth,
    async (req, res) => {
      const t = await find(Tournament, req.params.tournamentId);
      await squadOpen(t);
      const v = squadSchema.parse(req.body);
      const teams = await Team.find({ tournament: t._id }).distinct("_id");
      const players = await Player.find({
        _id: { $in: v.players },
        team: { $in: teams },
      });
      const result = validateSquad(t, players, v);
      let squad = await FantasySquad.findOne({
        user: req.user._id,
        tournament: t._id,
      });
      if (squad)
        check(
          v.version === squad.__v,
          "Squad changed in another session. Reload before saving.",
          409,
        );
      else
        check(v.version === undefined, "Squad no longer exists. Reload.", 409);
      const data = {
        players: v.players,
        starters: v.starters,
        captain: v.captain || null,
        viceCaptain: v.viceCaptain || null,
        complete: result.complete,
      };
      if (squad) {
        Object.assign(squad, data);
        squad.markModified("players");
        await squad.save();
      } else
        squad = await FantasySquad.create({
          ...data,
          user: req.user._id,
          tournament: t._id,
        });
      send(res, {
        ...squad.toObject(),
        budgetSpent: result.spent,
        budgetRemaining: t.budget - result.spent,
      });
    },
  );

  app.get("/api/my-squads", auth, async (req, res) =>
    send(
      res,
      await FantasySquad.find({ user: req.user._id })
        .populate("tournament")
        .populate("players", "name fantasyPrice position")
        .sort({ updatedAt: -1 }),
    ),
  );

  app.get(
    "/api/tournaments/:tournamentId/participation",
    auth,
    admin,
    async (req, res) => {
      await find(Tournament, req.params.tournamentId);
      send(
        res,
        await FantasySquad.find({ tournament: req.params.tournamentId })
          .populate("user", "name")
          .skip(page(req).skip)
          .limit(page(req).limit),
      );
    },
  );
}
