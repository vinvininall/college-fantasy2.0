import { z } from "zod";
export const scoringDefaults = {
  goal: { GK: 10, DEF: 7, MID: 6, FWD: 5 },
  assist: 3,
  cleanSheet: 4,
  penaltySave: 5,
  yellowCard: -1,
  redCard: -3,
  ownGoal: -2,
  captain: 2,
  viceCaptain: 1.5,
};
const count = z.number().int().min(0).max(100);
const money = z.number().int().min(0).max(1e12);
const text = z.string().trim().min(1).max(120);
const points = z.number().min(-100).max(100).multipleOf(0.5);
export const formationSchema = z
  .object({ name: text, GK: count, DEF: count, MID: count, FWD: count })
  .strict();
export const tournamentSchema = z
  .object({
    name: text,
    college: text,
    description: z.string().max(3000).default(""),
    format: z.enum(["5v5", "6v6", "7v7", "9v9", "11v11"]),
    budget: money.positive(),
    squadSize: count.positive(),
    startingPlayers: count.positive(),
    substitutes: count,
    formations: z.array(formationSchema).max(30).default([]),
    formationPolicy: z
      .enum(["configured", "unrestricted"])
      .default("configured"),
    registrationEnabled: z.boolean().default(true),
    scoring: z
      .object({
        goal: z
          .object({ GK: points, DEF: points, MID: points, FWD: points })
          .strict(),
        assist: points,
        cleanSheet: points,
        penaltySave: points,
        yellowCard: points,
        redCard: points,
        ownGoal: points,
        captain: z.number().min(1).max(5).multipleOf(0.5),
        viceCaptain: z.number().min(1).max(5).multipleOf(0.5),
      })
      .strict()
      .default(scoringDefaults),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.squadSize !== v.startingPlayers + v.substitutes)
      c.addIssue({
        code: "custom",
        message: "Squad size must equal starters plus substitutes",
      });
    if (v.formationPolicy === "configured" && !v.formations.length)
      c.addIssue({
        code: "custom",
        message: "Add a permitted formation or explicitly choose unrestricted",
      });
    if (
      v.formations.some(
        (f) => f.GK + f.DEF + f.MID + f.FWD !== v.startingPlayers,
      )
    )
      c.addIssue({
        code: "custom",
        message: "Every formation must total the starting lineup size",
      });
  });
export const teamSchema = z
  .object({
    name: text,
    shortName: z.string().trim().min(2).max(6),
    logoUrl: z.union([z.literal(""), z.url().regex(/^https?:\/\//)]).optional(),
  })
  .strict();
export const playerSchema = z
  .object({
    name: text,
    position: z.enum(["GK", "DEF", "MID", "FWD"]),
    auctionPrice: money,
    fantasyPrice: money,
    jerseyNumber: z.number().int().min(0).max(999).optional(),
    photoUrl: z
      .union([z.literal(""), z.url().regex(/^https?:\/\//)])
      .optional(),
  })
  .strict();
export function check(condition, message, status = 400) {
  if (!condition) {
    const e = new Error(message);
    e.status = status;
    throw e;
  }
}
export function validateSquad(t, players, body) {
  const ids = body.players;
  const starters = body.starters;
  check(new Set(ids).size === ids.length, "Duplicate player selection");
  check(new Set(starters).size === starters.length, "Duplicate starters");
  check(ids.length <= t.squadSize, "Squad size exceeded");
  check(players.length === ids.length, "Invalid player reference");
  const spent = players.reduce((s, p) => s + p.fantasyPrice, 0);
  check(spent <= t.budget, "Fantasy budget exceeded");
  check(
    starters.length <= t.startingPlayers &&
      starters.every((id) => ids.includes(id)),
    "Invalid starting lineup",
  );
  if (body.captain)
    check(ids.includes(body.captain), "Captain must belong to squad");
  if (body.viceCaptain)
    check(ids.includes(body.viceCaptain), "Vice-captain must belong to squad");
  check(
    !body.captain || body.captain !== body.viceCaptain,
    "Captain and vice-captain must differ",
  );
  let formationValid = t.formationPolicy === "unrestricted";
  const positions = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  players
    .filter((p) => starters.includes(String(p._id)))
    .forEach((p) => positions[p.position]++);
  formationValid ||= t.formations.some((f) =>
    Object.keys(positions).every((k) => positions[k] === f[k]),
  );
  const complete =
    ids.length === t.squadSize &&
    starters.length === t.startingPlayers &&
    !!body.captain &&
    !!body.viceCaptain &&
    formationValid;
  check(
    !body.complete || complete,
    "Complete squad requires full selection, legal formation, captain and vice-captain",
  );
  return { spent, complete: !!body.complete && complete };
}
