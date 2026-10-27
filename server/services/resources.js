import { z } from "zod";
import {
  Tournament,
  FantasySquad,
  Match,
  MatchEvent,
} from "../models/index.js";
import { auth } from "../middleware/auth.js";
import { check } from "./rules.js";

export const send = (res, data, status = 200) =>
  res.status(status).json({ data });

export const id = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid resource ID");

export const page = (req) => {
  const v = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .parse(req.query);
  return { skip: (v.page - 1) * v.limit, limit: v.limit };
};

export const find = async (Model, value) => {
  id.parse(value);
  const doc = await Model.findById(value);
  check(doc, "Resource not found", 404);
  return doc;
};

export const visible = async (value, req) => {
  const t = await find(Tournament, value);
  if (t.status === "draft") {
    check(req, "Tournament not found", 404);
    await new Promise((resolve, reject) =>
      auth(req, null, (e) => (e ? reject(e) : resolve())),
    );
    check(req.user.role === "admin", "Tournament not found", 404);
  }
  return t;
};
export const privateTournament = async (req, res, next) => {
  try {
    req.tournament = await find(Tournament, req.params.tournamentId);
    if (req.tournament.status === "draft") {
      await new Promise((resolve, reject) =>
        auth(req, res, (e) => (e ? reject(e) : resolve())),
      );
      check(req.user.role === "admin", "Tournament not found", 404);
    }
    next();
  } catch (e) {
    next(e);
  }
};

export async function mutable(tournament) {
  const t = await find(Tournament, String(tournament));
  check(t.status !== "completed", "Completed tournaments are read-only", 409);
  return t;
}

export async function squadDisclosureAllowed(tournament) {
  const liveMatch = await Match.exists({
    tournament: tournament._id,
    status: "live",
  });
  if (liveMatch) return false;
  const kickoffPassed = await Match.exists({
    tournament: tournament._id,
    status: { $ne: "cancelled" },
    scheduledAt: { $lte: new Date() },
  });
  return (
    tournament.status !== "upcoming" ||
    !tournament.registrationEnabled ||
    !!kickoffPassed
  );
}

export async function rosterEditable(tournament) {
  const t = await mutable(tournament);
  check(
    ["draft", "upcoming"].includes(t.status),
    "Roster is locked after tournament starts",
    409,
  );
  check(
    !(await FantasySquad.exists({ tournament: t._id })),
    "Roster is locked once a fantasy squad exists",
    409,
  );
  check(
    !(await MatchEvent.exists({
      match: { $in: await Match.find({ tournament: t._id }).distinct("_id") },
    })),
    "Roster has match history",
    409,
  );
  return t;
}
