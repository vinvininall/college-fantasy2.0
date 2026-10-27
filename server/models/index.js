import mongoose from "mongoose";
const { Schema } = mongoose;
const ref = (model, required = true) => ({
  type: Schema.Types.ObjectId,
  ref: model,
  required,
});
const integer = (min = 0) => ({
  type: Number,
  min,
  required: true,
  validate: Number.isSafeInteger,
});
const options = { timestamps: true, optimisticConcurrency: true };
const user = new Schema(
  {
    name: { type: String, required: true, trim: true, maxLength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  options,
);
const tournament = new Schema(
  {
    name: { type: String, required: true },
    college: { type: String, required: true },
    description: String,
    format: {
      type: String,
      enum: ["5v5", "6v6", "7v7", "9v9", "11v11"],
      required: true,
    },
    playersPerSide: integer(1),
    budget: integer(1),
    squadSize: integer(1),
    startingPlayers: integer(1),
    substitutes: integer(0),
    formations: [
      {
        _id: false,
        name: String,
        GK: integer(),
        DEF: integer(),
        MID: integer(),
        FWD: integer(),
      },
    ],
    formationPolicy: {
      type: String,
      enum: ["configured", "unrestricted"],
      default: "configured",
    },
    scoring: {
      goal: { GK: Number, DEF: Number, MID: Number, FWD: Number },
      assist: Number,
      cleanSheet: Number,
      penaltySave: Number,
      yellowCard: Number,
      redCard: Number,
      ownGoal: Number,
      captain: Number,
      viceCaptain: Number,
    },
    status: {
      type: String,
      enum: ["draft", "upcoming", "active", "completed"],
      default: "draft",
    },
    registrationEnabled: { type: Boolean, default: true },
    creator: ref("User"),
    demoKey: { type: String, unique: true, sparse: true },
  },
  options,
);
const team = new Schema(
  {
    name: { type: String, required: true, trim: true },
    shortName: { type: String, required: true, trim: true, uppercase: true },
    tournament: ref("Tournament"),
    logoUrl: String,
  },
  options,
);
team.index(
  { tournament: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
team.index({ tournament: 1, shortName: 1 }, { unique: true });
const player = new Schema(
  {
    name: { type: String, required: true },
    team: ref("Team"),
    position: {
      type: String,
      enum: ["GK", "DEF", "MID", "FWD"],
      required: true,
    },
    auctionPrice: integer(),
    fantasyPrice: integer(),
    jerseyNumber: {
      type: Number,
      min: 0,
      max: 999,
      validate: Number.isInteger,
    },
    photoUrl: String,
    demoKey: { type: String, unique: true, sparse: true },
  },
  options,
);
player.index({ team: 1, position: 1 });
const squad = new Schema(
  {
    user: ref("User"),
    tournament: ref("Tournament"),
    players: [ref("Player")],
    starters: [ref("Player")],
    captain: ref("Player", false),
    viceCaptain: ref("Player", false),
    complete: { type: Boolean, default: false },
  },
  options,
);
squad.index({ user: 1, tournament: 1 }, { unique: true });
const match = new Schema(
  {
    tournament: ref("Tournament"),
    homeTeam: ref("Team"),
    awayTeam: ref("Team"),
    scheduledAt: { type: Date, required: true },
    venue: String,
    status: {
      type: String,
      enum: ["scheduled", "live", "completed", "cancelled"],
      default: "scheduled",
    },
    homeScore: integer(),
    awayScore: integer(),
  },
  options,
);
match.index({ tournament: 1, scheduledAt: 1 });
const event = new Schema(
  {
    match: ref("Match"),
    player: ref("Player"),
    type: {
      type: String,
      enum: [
        "goal",
        "assist",
        "ownGoal",
        "yellowCard",
        "redCard",
        "penaltySave",
        "cleanSheet",
      ],
      required: true,
    },
    minute: integer(),
    recordedBy: ref("User"),
    relatedGoal: ref("MatchEvent", false),
  },
  options,
);
event.index({ match: 1, player: 1 });
event.index({ match: 1, player: 1, type: 1, minute: 1 }, { unique: true });
event.index(
  { match: 1, player: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: "cleanSheet" } },
);
event.index(
  { relatedGoal: 1 },
  {
    unique: true,
    partialFilterExpression: { relatedGoal: { $type: "objectId" } },
  },
);
export const User = mongoose.model("User", user);
export const Tournament = mongoose.model("Tournament", tournament);
export const Team = mongoose.model("Team", team);
export const Player = mongoose.model("Player", player);
export const FantasySquad = mongoose.model("FantasySquad", squad);
export const Match = mongoose.model("Match", match);
export const MatchEvent = mongoose.model("MatchEvent", event);
