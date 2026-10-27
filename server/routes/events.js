import { tallyGoals } from "../services/matchScores.js";
import { z } from "zod";
import { Player, Match, MatchEvent } from "../models/index.js";
import { auth, admin } from "../middleware/auth.js";
import { check } from "../services/rules.js";

import {
  send,
  id,
  page,
  find,
  visible,
  mutable,
} from "../services/resources.js";
import { mutate } from "../middleware/mutations.js";

export function registerEventsRoutes(app) {
  const eventSchema = z
    .object({
      player: id,
      type: z.enum([
        "goal",
        "assist",
        "ownGoal",
        "yellowCard",
        "redCard",
        "penaltySave",
        "cleanSheet",
      ]),
      minute: z.number().int().min(0).max(150),
      relatedGoal: id.nullable().optional(),
    })
    .strict();

  async function validateEvent(v, m, exclude) {
    const t = await mutable(m.tournament);
    check(t.status === "active", "Events require an active tournament", 409);
    check(
      ["live", "completed"].includes(m.status),
      "Events require a live or completed match",
      409,
    );
    const p = await find(Player, v.player);
    check(
      [String(m.homeTeam), String(m.awayTeam)].includes(String(p.team)),
      "Player does not participate in this match",
    );
    if (v.type === "penaltySave")
      check(p.position === "GK", "Penalty save requires goalkeeper");
    if (v.type === "cleanSheet") {
      check(
        ["GK", "DEF"].includes(p.position),
        "Clean sheets are credited to GK or DEF",
      );
      check(
        !(await MatchEvent.exists({
          match: m._id,
          player: p._id,
          type: "cleanSheet",
          ...(exclude ? { _id: { $ne: exclude } } : {}),
        })),
        "Clean sheet already credited",
      );
    }
    if (v.type === "assist") {
      check(v.relatedGoal, "Assist must reference a goal");
      check(
        String(v.relatedGoal) !== String(exclude),
        "An event cannot assist itself",
      );
      const goal = await find(MatchEvent, v.relatedGoal);
      check(v.minute === goal.minute, "Assist minute must match its goal");
      check(
        goal.type === "goal" &&
          String(goal.match) === String(m._id) &&
          String(goal.player) !== v.player,
        "Invalid assist relationship",
      );
      const scorer = await find(Player, String(goal.player));
      check(
        String(scorer.team) === String(p.team),
        "Assist must be for a teammate",
      );
    } else check(!v.relatedGoal, "Only assists can reference goals");
  }

  async function cleanSheetConsistency(v, m, exclude) {
    const existing = await MatchEvent.find({
      match: m._id,
      ...(exclude ? { _id: { $ne: exclude } } : {}),
    }).lean();
    const all = [...existing, v];
    if (!all.some((e) => e.type === "cleanSheet")) return;
    const players = await Player.find({
      _id: { $in: all.map((e) => e.player) },
    })
      .select("team")
      .lean();
    const score = tallyGoals(m, all, players);
    for (const event of all.filter((e) => e.type === "cleanSheet")) {
      const player = players.find(
        (p) => String(p._id) === String(event.player),
      );
      const opponentGoals =
        String(player.team) === String(m.homeTeam)
          ? score.awayScore
          : score.homeScore;
      check(
        opponentGoals === 0,
        "Clean-sheet credit conflicts with conceded goals. Correct or remove the clean-sheet credit first.",
      );
    }
  }

  app.get("/api/matches/:matchId/events", async (req, res) => {
    const m = await find(Match, req.params.matchId);
    await visible(String(m.tournament), req);
    send(
      res,
      await MatchEvent.find({ match: m._id })
        .populate("player", "name position")
        .sort({ minute: 1 })
        .skip(page(req).skip)
        .limit(page(req).limit),
    );
  });

  mutate(
    app,
    "post",
    "/api/matches/:matchId/events",
    auth,
    admin,
    async (req, res) => {
      const m = await find(Match, req.params.matchId);
      const v = eventSchema.parse(req.body);
      await validateEvent(v, m);
      await cleanSheetConsistency(v, m);
      check(
        !(await MatchEvent.exists({
          match: m._id,
          player: v.player,
          type: v.type,
          minute: v.minute,
        })),
        "Identical event already recorded",
        409,
      );
      send(
        res,
        await MatchEvent.create({
          ...v,
          match: m._id,
          recordedBy: req.user._id,
        }),
        201,
      );
    },
  );

  mutate(
    app,
    "put",
    "/api/match-events/:eventId",
    auth,
    admin,
    async (req, res) => {
      const e = await find(MatchEvent, req.params.eventId);
      const m = await find(Match, String(e.match));
      const v = eventSchema.parse(req.body);
      await validateEvent(v, m, e._id);
      await cleanSheetConsistency(v, m, e._id);
      check(
        !(await MatchEvent.exists({ relatedGoal: e._id })),
        "Remove linked assist before changing this goal",
        409,
      );
      check(
        !(await MatchEvent.exists({
          _id: { $ne: e._id },
          match: m._id,
          player: v.player,
          type: v.type,
          minute: v.minute,
        })),
        "Identical event already recorded",
        409,
      );
      Object.assign(e, v, {
        relatedGoal: v.relatedGoal || null,
        recordedBy: req.user._id,
      });
      send(res, await e.save());
    },
  );

  mutate(
    app,
    "delete",
    "/api/match-events/:eventId",
    auth,
    admin,
    async (req, res) => {
      const e = await find(MatchEvent, req.params.eventId);
      const m = await find(Match, String(e.match));
      const t = await mutable(m.tournament);
      check(t.status === "active", "Events require an active tournament", 409);
      check(
        !(await MatchEvent.exists({ relatedGoal: e._id })),
        "Remove linked assist first",
        409,
      );
      await e.deleteOne();
      send(res, { deleted: true });
    },
  );
}
