import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../app.js";
import {
  User,
  Tournament,
  Team,
  Player,
  FantasySquad,
  Match,
  MatchEvent,
} from "../models/index.js";
import {
  scoringDefaults,
  validateSquad,
  tournamentSchema,
} from "../services/rules.js";
import { scoreEvents, scoreSquad } from "../services/scoring.js";
let mongo, temp, adminToken, userToken, otherToken, testUri;
const password = "Test-password-2026";
const config = () => ({
  name: "Test Cup",
  college: "Fictional Test College",
  description: "test",
  format: "5v5",
  budget: 1000,
  squadSize: 6,
  startingPlayers: 5,
  substitutes: 1,
  formations: [{ name: "1-2-1", GK: 1, DEF: 1, MID: 2, FWD: 1 }],
  formationPolicy: "configured",
  registrationEnabled: true,
  scoring: scoringDefaults,
});
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const sign = (u) =>
  jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(u._id),
    expiresIn: "1h",
    issuer: "sfl-fantasy",
  });
async function call(method, path, token, body) {
  const r = request(app)
    [method](`/api${path}`)
    .set(auth(token || userToken));
  return body === undefined ? r : r.send(body);
}
async function tournament(status = "upcoming", overrides = {}) {
  return Tournament.create({
    ...config(),
    ...overrides,
    playersPerSide: 5,
    creator: (await User.findOne({ role: "admin" }))._id,
    status,
  });
}
async function roster(t) {
  const a = await Team.create({
    name: "Falcons",
    shortName: "FAL",
    tournament: t._id,
  });
  const b = await Team.create({
    name: "Wolves",
    shortName: "WOL",
    tournament: t._id,
  });
  const ps = [];
  for (const [i, position] of [
    "GK",
    "DEF",
    "MID",
    "MID",
    "FWD",
    "FWD",
  ].entries())
    ps.push(
      await Player.create({
        name: `Player ${i}`,
        position,
        auctionPrice: 100,
        fantasyPrice: 100,
        team: i % 2 ? a._id : b._id,
      }),
    );
  return { a, b, ps };
}
const squadBody = (ps) => ({
  players: ps.map((p) => String(p._id)),
  starters: ps.slice(0, 5).map((p) => String(p._id)),
  captain: String(ps[4]._id),
  viceCaptain: String(ps[2]._id),
  complete: true,
});
beforeAll(async () => {
  process.env.JWT_SECRET = "isolated-test-secret-with-at-least-32-characters";
  let uri = process.env.TEST_MONGODB_URI;
  if (uri) {
    if (!new URL(uri).pathname.endsWith("_test"))
      throw new Error("Test DB name must end in _test");
  } else {
    temp = await mkdtemp(join(tmpdir(), "sfl-mongo-"));
    const port = 28000 + Math.floor(Math.random() * 1000);
    mongo = spawn(
      "mongod",
      [
        "--dbpath",
        temp,
        "--port",
        String(port),
        "--bind_ip",
        "127.0.0.1",
        "--quiet",
      ],
      { stdio: "ignore" },
    );
    uri = `mongodb://127.0.0.1:${port}/sfl_${Date.now()}_test`;
    await new Promise((resolve, reject) => {
      mongo.once("error", reject);
      setTimeout(resolve, 1800);
    });
  }
  testUri = uri;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) {
    await new Promise((resolve) => {
      mongo.once("exit", resolve);
      mongo.kill("SIGTERM");
    });
    await rm(temp, { recursive: true, force: true });
  }
});
beforeEach(async () => {
  for (const model of Object.values(mongoose.models))
    await model.deleteMany({});
  const hash = await bcrypt.hash(password, 4);
  const [a, u, o] = await User.create([
    {
      name: "Administrator",
      email: "admin@example.test",
      passwordHash: hash,
      role: "admin",
    },
    { name: "Manager", email: "user@example.test", passwordHash: hash },
    { name: "Other manager", email: "other@example.test", passwordHash: hash },
  ]);
  adminToken = sign(a);
  userToken = sign(u);
  otherToken = sign(o);
});
describe("Authentication and authorization", () => {
  it("registers, normalizes, hashes and restores sessions without exposing hashes", async () => {
    const r = await request(app)
      .post("/api/auth/register")
      .send({ name: "New Manager", email: "NEW@example.test", password });
    expect(r.status).toBe(201);
    expect(r.body.data.user.role).toBe("user");
    expect(r.body.data.user.passwordHash).toBeUndefined();
    const u = await User.findOne({ email: "new@example.test" }).select(
      "+passwordHash",
    );
    expect(u.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, u.passwordHash)).toBe(true);
    const me = await call("get", "/auth/me", r.body.data.token);
    expect(me.body.data.email).toBe("new@example.test");
  });
  it("allows any characters in a seven-character password and rejects shorter ones", async () => {
    const accepted = await request(app).post("/api/auth/register").send({
      name: "New Manager",
      email: "symbols@example.test",
      password: "!!!!!!!",
    });
    expect(accepted.status).toBe(201);
    const rejected = await request(app).post("/api/auth/register").send({
      name: "New Manager",
      email: "short@example.test",
      password: "!!!!!!",
    });
    expect(rejected.status).toBe(400);
  });
  it("rejects duplicate email and public role escalation", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .send({ name: "Manager", email: "user@example.test", password })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app).post("/api/auth/register").send({
          name: "Hacker",
          email: "hack@example.test",
          password,
          role: "admin",
        })
      ).status,
    ).toBe(400);
  });
  it("logs in and uses the same invalid-credentials message", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email: "user@example.test", password })
      ).status,
    ).toBe(200);
    const a = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.test", password: "wrong-password" });
    const b = await request(app)
      .post("/api/auth/login")
      .send({ email: "absent@example.test", password: "wrong-password" });
    expect(a.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
  it.each(["garbage", "a.b.c", "expired", "wrong-signature"])(
    "rejects invalid JWT: %s",
    async (value) => {
      let token = value;
      if (value === "expired")
        token = jwt.sign(
          { sub: String(new mongoose.Types.ObjectId()) },
          process.env.JWT_SECRET,
          { expiresIn: -1, issuer: "sfl-fantasy" },
        );
      if (value === "wrong-signature")
        token = jwt.sign(
          { sub: String(new mongoose.Types.ObjectId()) },
          "wrong-secret",
          { issuer: "sfl-fantasy" },
        );
      expect((await call("get", "/auth/me", token)).status).toBe(401);
    },
  );
  it("blocks anonymous access and normal-user administrative mutation", async () => {
    expect((await request(app).get("/api/my-squads")).status).toBe(401);
    expect(
      (await call("post", "/tournaments", userToken, config())).status,
    ).toBe(403);
    expect((await call("get", "/admin/tournaments", userToken)).status).toBe(
      403,
    );
  });
});
describe("Tournament, teams and players", () => {
  it.each(["5v5", "6v6", "7v7", "9v9", "11v11"])(
    "admin creates %s with independent fantasy rules",
    async (format) => {
      const r = await call("post", "/tournaments", adminToken, {
        ...config(),
        format,
      });
      expect(r.status).toBe(201);
      expect(r.body.data.playersPerSide).toBe(parseInt(format));
    },
  );
  it.each([
    { format: "8v8" },
    { budget: -1 },
    { budget: 1.5 },
    { squadSize: 8 },
    { startingPlayers: 0 },
    { formations: [] },
    { formations: [{ name: "bad", GK: 1, DEF: 1, MID: 1, FWD: 1 }] },
  ])("rejects invalid config %j", async (override) => {
    expect(
      (
        await call("post", "/tournaments", adminToken, {
          ...config(),
          ...override,
        })
      ).status,
    ).toBe(400);
  });
  it("hides drafts, validates IDs and enforces forward lifecycle", async () => {
    const t = await tournament("draft");
    expect((await request(app).get(`/api/tournaments/${t._id}`)).status).toBe(
      401,
    );
    expect((await request(app).get("/api/tournaments/not-an-id")).status).toBe(
      400,
    );
    expect((await request(app).get("/api/tournaments")).body.data).toEqual([]);
    expect(
      (
        await call("patch", `/tournaments/${t._id}/status`, adminToken, {
          status: "active",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("patch", `/tournaments/${t._id}/status`, adminToken, {
          status: "upcoming",
        })
      ).status,
    ).toBe(200);
  });
  it("enforces team uniqueness within a tournament and allows another tournament", async () => {
    const t = await tournament(),
      other = await tournament();
    const body = { name: "Falcons", shortName: "FAL" };
    expect(
      (await call("post", `/tournaments/${t._id}/teams`, adminToken, body))
        .status,
    ).toBe(201);
    expect(
      (
        await call("post", `/tournaments/${t._id}/teams`, adminToken, {
          ...body,
          name: "FALCONS",
        })
      ).status,
    ).toBe(409);
    expect(
      (await call("post", `/tournaments/${other._id}/teams`, adminToken, body))
        .status,
    ).toBe(201);
    expect(
      (
        await call(
          "post",
          `/tournaments/${new mongoose.Types.ObjectId()}/teams`,
          adminToken,
          body,
        )
      ).status,
    ).toBe(404);
  });
  it("imports multiple teams and players from validated JSON", async () => {
    const t = await tournament();
    const response = await call(
      "post",
      `/tournaments/${t._id}/roster/import`,
      adminToken,
      {
        teams: [
          {
            name: "Falcons",
            shortName: "FAL",
            players: [
              {
                name: "Aarav Sharma",
                position: "FWD",
                auctionPrice: 500,
                fantasyPrice: 120,
                jerseyNumber: 10,
              },
            ],
          },
          {
            name: "Wolves",
            shortName: "WOL",
            players: [
              {
                name: "Mira Patel",
                position: "GK",
                auctionPrice: 400,
                fantasyPrice: 110,
              },
            ],
          },
        ],
      },
    );
    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ teams: 2, players: 2 });
    expect(await Team.countDocuments({ tournament: t._id })).toBe(2);
    expect(await Player.countDocuments()).toBe(2);
    expect(
      await Player.findOne({ name: "Aarav Sharma" }).populate("team"),
    ).toMatchObject({ team: { name: "Falcons" } });
  });
  it("rejects invalid and duplicate roster imports without creating partial records", async () => {
    const t = await tournament();
    const response = await call(
      "post",
      `/tournaments/${t._id}/roster/import`,
      adminToken,
      {
        teams: [
          {
            name: "Falcons",
            shortName: "FAL",
            players: [
              {
                name: "Invalid Player",
                position: "STR",
                auctionPrice: 500,
                fantasyPrice: 120,
              },
            ],
          },
          { name: "Falcons", shortName: "FAL" },
        ],
      },
    );
    expect(response.status).toBe(400);
    expect(await Team.countDocuments({ tournament: t._id })).toBe(0);
    expect(await Player.countDocuments()).toBe(0);
  });
  it("validates positions/prices/relationships and safe deletions", async () => {
    const t = await tournament(),
      { a, ps } = await roster(t);
    expect(
      (
        await call("post", `/teams/${a._id}/players`, adminToken, {
          name: "Invalid",
          position: "ST",
          auctionPrice: 1,
          fantasyPrice: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("post", `/teams/${a._id}/players`, adminToken, {
          name: "Invalid",
          position: "GK",
          auctionPrice: -1,
          fantasyPrice: 1,
        })
      ).status,
    ).toBe(400);
    expect((await call("delete", `/teams/${a._id}`, adminToken)).status).toBe(
      409,
    );
    const other = await tournament();
    expect(
      (
        await request(app).get(
          `/api/tournaments/${other._id}/players?team=${a._id}`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app).get(
          `/api/tournaments/${other._id}/players/${ps[0]._id}/performance`,
        )
      ).status,
    ).toBe(404);
  });
});
describe("Squads, authoritative budgets and concurrency", () => {
  it("creates one squad per user and isolates ownership", async () => {
    const t = await tournament(),
      { ps } = await roster(t);
    const body = squadBody(ps);
    const r = await call(
      "put",
      `/tournaments/${t._id}/my-squad`,
      userToken,
      body,
    );
    expect(r.status).toBe(200);
    expect(r.body.data.budgetSpent).toBe(600);
    expect(
      (await call("put", `/tournaments/${t._id}/my-squad`, otherToken, body))
        .status,
    ).toBe(200);
    expect(await FantasySquad.countDocuments()).toBe(2);
    expect(
      (
        await call("put", `/tournaments/${t._id}/my-squad`, otherToken, {
          ...body,
          userId: r.body.data.user,
        })
      ).status,
    ).toBe(400);
    expect(
      (await call("put", `/tournaments/${t._id}/my-squad`, userToken, body))
        .status,
    ).toBe(409);
  });
  it("rejects duplicate and cross-tournament player selections", async () => {
    const t = await tournament(),
      { ps } = await roster(t);
    const other = await tournament(),
      ro = await roster(other);
    const body = squadBody(ps);
    expect(
      (
        await call("put", `/tournaments/${t._id}/my-squad`, userToken, {
          ...body,
          players: [...body.players.slice(0, 5), body.players[0]],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("put", `/tournaments/${t._id}/my-squad`, userToken, {
          ...body,
          players: [...body.players.slice(0, 5), String(ro.ps[0]._id)],
        })
      ).status,
    ).toBe(400);
  });
  it("uses database prices and rejects client authority", async () => {
    const t = await tournament("upcoming", { budget: 500 }),
      { ps } = await roster(t);
    expect(
      (
        await call(
          "put",
          `/tournaments/${t._id}/my-squad`,
          userToken,
          squadBody(ps),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call("put", `/tournaments/${t._id}/my-squad`, userToken, {
          ...squadBody(ps),
          budget: 999999,
        })
      ).status,
    ).toBe(400);
  });
  it("enforces size, starter membership, formation and captain rules", async () => {
    const t = await tournament(),
      { ps, a } = await roster(t);
    const extra = await Player.create({
      name: "Extra",
      position: "MID",
      team: a._id,
      auctionPrice: 0,
      fantasyPrice: 0,
    });
    const body = squadBody(ps);
    for (const bad of [
      { players: [...body.players, String(extra._id)] },
      { starters: [String(extra._id), ...body.starters.slice(1)] },
      { starters: body.players.slice(1) },
      { captain: body.viceCaptain },
      { captain: String(extra._id) },
    ])
      expect(
        (
          await call("put", `/tournaments/${t._id}/my-squad`, userToken, {
            ...body,
            ...bad,
          })
        ).status,
      ).toBe(400);
  });
  it("allows partial progress and rejects incomplete completion", async () => {
    const t = await tournament(),
      { ps } = await roster(t);
    const body = {
      players: [String(ps[0]._id)],
      starters: [],
      captain: null,
      viceCaptain: null,
      complete: false,
    };
    expect(
      (await call("put", `/tournaments/${t._id}/my-squad`, userToken, body))
        .status,
    ).toBe(200);
    expect(
      (
        await call("put", `/tournaments/${t._id}/my-squad`, userToken, {
          ...body,
          complete: true,
          version: 0,
        })
      ).status,
    ).toBe(400);
  });
  it("detects conflicting concurrent edits", async () => {
    const t = await tournament(),
      { ps } = await roster(t);
    const body = squadBody(ps);
    await call("put", `/tournaments/${t._id}/my-squad`, userToken, body);
    const responses = await Promise.all([
      call("put", `/tournaments/${t._id}/my-squad`, userToken, {
        ...body,
        version: 0,
      }),
      call("put", `/tournaments/${t._id}/my-squad`, userToken, {
        ...body,
        version: 0,
      }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("freezes roster and locks squads when active or at kickoff", async () => {
    const t = await tournament(),
      { ps, a, b } = await roster(t);
    await call(
      "put",
      `/tournaments/${t._id}/my-squad`,
      userToken,
      squadBody(ps),
    );
    expect(
      (
        await call("put", `/players/${ps[0]._id}`, adminToken, {
          name: "Changed",
          position: "GK",
          auctionPrice: 100,
          fantasyPrice: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("put", `/tournaments/${t._id}`, adminToken, {
          ...config(),
          budget: 2000,
        })
      ).status,
    ).toBe(409);
    await Match.create({
      tournament: t._id,
      homeTeam: a._id,
      awayTeam: b._id,
      scheduledAt: new Date(0),
      homeScore: 0,
      awayScore: 0,
    });
    expect(
      (
        await call(
          "put",
          `/tournaments/${t._id}/my-squad`,
          otherToken,
          squadBody(ps),
        )
      ).status,
    ).toBe(409);
  });
});
describe("Fixtures and events", () => {
  it("admin schedules, rejects invalid teams, dates, scores and user writes", async () => {
    const t = await tournament(),
      { a, b } = await roster(t);
    const body = {
      homeTeam: String(a._id),
      awayTeam: String(b._id),
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      venue: "Test pitch",
    };
    expect(
      (await call("post", `/tournaments/${t._id}/matches`, adminToken, body))
        .status,
    ).toBe(201);
    expect(
      (await call("post", `/tournaments/${t._id}/matches`, userToken, body))
        .status,
    ).toBe(403);
    for (const override of [
      { awayTeam: body.homeTeam },
      { scheduledAt: "bad" },
      { scheduledAt: new Date(0).toISOString() },
    ])
      expect(
        (
          await call("post", `/tournaments/${t._id}/matches`, adminToken, {
            ...body,
            ...override,
          })
        ).status,
      ).toBe(400);
    const other = await tournament(),
      ro = await roster(other);
    expect(
      (
        await call("post", `/tournaments/${t._id}/matches`, adminToken, {
          ...body,
          awayTeam: String(ro.a._id),
        })
      ).status,
    ).toBe(400);
  });
  it("validates results, cancellation and event participation", async () => {
    const t = await tournament("active"),
      { a, b, ps } = await roster(t);
    const m = await Match.create({
      tournament: t._id,
      homeTeam: a._id,
      awayTeam: b._id,
      scheduledAt: new Date(),
      homeScore: 0,
      awayScore: 0,
    });
    expect(
      (
        await call("put", `/matches/${m._id}/result`, userToken, {
          status: "completed",
          homeScore: 1,
          awayScore: 0,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("put", `/matches/${m._id}/result`, adminToken, {
          status: "completed",
          homeScore: -1,
          awayScore: 0,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("put", `/matches/${m._id}/result`, adminToken, {
          status: "cancelled",
          homeScore: 0,
          awayScore: 0,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("post", `/matches/${m._id}/events`, adminToken, {
          type: "goal",
          player: String(ps[0]._id),
          minute: 1,
        })
      ).status,
    ).toBe(409);
  });
  it("rejects foreign players, duplicate events, invalid minutes and invalid assists", async () => {
    const t = await tournament("active"),
      { a, b, ps } = await roster(t);
    const m = await Match.create({
      tournament: t._id,
      homeTeam: a._id,
      awayTeam: b._id,
      scheduledAt: new Date(),
      status: "live",
      homeScore: 0,
      awayScore: 0,
    });
    const other = await tournament(),
      ro = await roster(other);
    const path = `/matches/${m._id}/events`;
    expect(
      (
        await call("post", path, adminToken, {
          type: "goal",
          player: String(ro.ps[0]._id),
          minute: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("post", path, adminToken, {
          type: "goal",
          player: String(ps[0]._id),
          minute: -1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("post", path, adminToken, {
          type: "assist",
          player: String(ps[0]._id),
          minute: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("post", path, adminToken, {
          type: "goal",
          player: String(ps[0]._id),
          minute: 1,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call("post", path, adminToken, {
          type: "goal",
          player: String(ps[0]._id),
          minute: 1,
        })
      ).status,
    ).toBe(409);
  });
});
describe("Scoring service", () => {
  it.each([
    ["GK", 10],
    ["DEF", 7],
    ["MID", 6],
    ["FWD", 5],
  ])("scores %s goals correctly", (position, points) => {
    expect(
      scoreEvents(
        [{ player: "a", match: "m", type: "goal", minute: 1 }],
        [{ _id: "a", name: "A", position }],
        scoringDefaults,
      ).a.points,
    ).toBe(points);
  });
  it("aggregates all contributions and applies captain, vice and bench exactly once", () => {
    const ps = [
      { _id: "a", position: "FWD" },
      { _id: "b", position: "MID" },
      { _id: "c", position: "GK" },
    ];
    const events = [
      ["a", "goal"],
      ["a", "assist"],
      ["a", "ownGoal"],
      ["a", "yellowCard"],
      ["a", "redCard"],
      ["b", "goal"],
      ["c", "penaltySave"],
      ["c", "cleanSheet"],
    ].map(([player, type]) => ({ player, type, match: "m", minute: 1 }));
    const b = scoreEvents(events, ps, scoringDefaults);
    expect(b.a.points).toBe(2);
    expect(b.c.points).toBe(9);
    const s = {
      players: ["a", "b", "c"],
      starters: ["a", "b"],
      captain: "a",
      viceCaptain: "b",
    };
    expect(scoreSquad(s, b, scoringDefaults).map((r) => r.points)).toEqual([
      4, 9, 0,
    ]);
    expect(scoreSquad(s, b, scoringDefaults).map((r) => r.points)).toEqual([
      4, 9, 0,
    ]);
  });
  it("honors per-tournament rules and half points", () => {
    const rules = {
      ...scoringDefaults,
      goal: { ...scoringDefaults.goal, FWD: 7 },
    };
    const b = scoreEvents(
      [{ player: "a", type: "goal" }],
      [{ _id: "a", position: "FWD" }],
      rules,
    );
    expect(
      scoreSquad(
        { players: ["a"], starters: ["a"], viceCaptain: "a" },
        b,
        rules,
      )[0].points,
    ).toBe(10.5);
  });
});
it("complete HTTP workflow: administration → squad → finalized events → corrections → leaderboard", async () => {
  adminToken = (
    await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.test", password })
  ).body.data.token;
  const registered = await request(app).post("/api/auth/register").send({
    name: "Workflow manager",
    email: "workflow@example.test",
    password,
  });
  expect(registered.status).toBe(201);
  userToken = (
    await request(app)
      .post("/api/auth/login")
      .send({ email: "workflow@example.test", password })
  ).body.data.token;
  const created = await call("post", "/tournaments", adminToken, config());
  expect(created.status).toBe(201);
  const tid = created.body.data._id;
  const a = (
    await call("post", `/tournaments/${tid}/teams`, adminToken, {
      name: "Home",
      shortName: "HOM",
    })
  ).body.data;
  const b = (
    await call("post", `/tournaments/${tid}/teams`, adminToken, {
      name: "Away",
      shortName: "AWY",
    })
  ).body.data;
  const ps = [];
  for (const [i, position] of [
    "GK",
    "DEF",
    "MID",
    "MID",
    "FWD",
    "FWD",
  ].entries()) {
    const r = await call(
      "post",
      `/teams/${i % 2 ? a._id : b._id}/players`,
      adminToken,
      { name: `Player ${i}`, position, auctionPrice: 100, fantasyPrice: 100 },
    );
    expect(r.status).toBe(201);
    ps.push(r.body.data);
  }
  await call("patch", `/tournaments/${tid}/status`, adminToken, {
    status: "upcoming",
  });
  expect(
    (
      await call(
        "put",
        `/tournaments/${tid}/my-squad`,
        userToken,
        squadBody(ps),
      )
    ).status,
  ).toBe(200);
  await call("put", `/tournaments/${tid}/my-squad`, otherToken, squadBody(ps));
  const fixture = (
    await call("post", `/tournaments/${tid}/matches`, adminToken, {
      homeTeam: a._id,
      awayTeam: b._id,
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      venue: "Test stadium",
    })
  ).body.data;
  expect(fixture._id).toBeDefined();
  await call("patch", `/tournaments/${tid}/status`, adminToken, {
    status: "active",
  });
  await call("put", `/matches/${fixture._id}/result`, adminToken, {
    status: "live",
    homeScore: 0,
    awayScore: 0,
  });
  const goal = (
    await call("post", `/matches/${fixture._id}/events`, adminToken, {
      player: ps[4]._id,
      type: "goal",
      minute: 20,
    })
  ).body.data;
  expect(goal._id).toBeDefined();
  await call("post", `/matches/${fixture._id}/events`, adminToken, {
    player: ps[2]._id,
    type: "assist",
    minute: 20,
    relatedGoal: goal._id,
  });
  await call("post", `/matches/${fixture._id}/events`, adminToken, {
    player: ps[5]._id,
    type: "goal",
    minute: 30,
  });
  expect(
    (await call("get", `/tournaments/${tid}/my-performance`, userToken)).body
      .data.points,
  ).toBe(0);
  expect(
    (
      await call("put", `/matches/${fixture._id}/result`, adminToken, {
        status: "completed",
        homeScore: 1,
        awayScore: 1,
      })
    ).status,
  ).toBe(200);
  let perf = (
    await call("get", `/tournaments/${tid}/my-performance`, userToken)
  ).body.data;
  expect(perf.points).toBe(14.5);
  expect(perf.details.find((p) => p.player === ps[5]._id).points).toBe(0);
  let board = (await call("get", `/tournaments/${tid}/leaderboard`, userToken))
    .body.data;
  expect(board.map((r) => r.rank)).toEqual([1, 1]);
  expect(board[0].points).toBe(14.5);
  const assist = await MatchEvent.findOne({ type: "assist" });
  expect(
    (await call("delete", `/match-events/${goal._id}`, adminToken)).status,
  ).toBe(409);
  await call("delete", `/match-events/${assist._id}`, adminToken);
  expect(
    (
      await call("put", `/match-events/${goal._id}`, adminToken, {
        player: ps[4]._id,
        type: "yellowCard",
        minute: 20,
      })
    ).status,
  ).toBe(200);
  perf = (await call("get", `/tournaments/${tid}/my-performance`, userToken))
    .body.data;
  expect(perf.points).toBe(-2);
  expect(
    (await call("get", `/tournaments/${tid}/my-performance`, userToken)).body
      .data.points,
  ).toBe(-2);
  await call("delete", `/match-events/${goal._id}`, adminToken);
  expect(
    (await call("get", `/tournaments/${tid}/my-performance`, userToken)).body
      .data.points,
  ).toBe(0);
  expect(
    (
      await call("post", `/matches/${fixture._id}/events`, userToken, {
        player: ps[0]._id,
        type: "goal",
        minute: 2,
      })
    ).status,
  ).toBe(403);
  await call("patch", `/tournaments/${tid}/status`, adminToken, {
    status: "completed",
  });
  expect(
    (
      await call("post", `/matches/${fixture._id}/events`, adminToken, {
        player: ps[0]._id,
        type: "goal",
        minute: 2,
      })
    ).status,
  ).toBe(409);
});

describe("Final-score consistency and historical safety", () => {
  it("checks scores against goals and recalculates own goals and corrections", async () => {
    const t = await tournament("active"),
      { a, b, ps } = await roster(t);
    const m = await Match.create({
      tournament: t._id,
      homeTeam: a._id,
      awayTeam: b._id,
      scheduledAt: new Date(),
      status: "live",
      homeScore: 0,
      awayScore: 0,
    });
    const goal = await call("post", `/matches/${m._id}/events`, adminToken, {
      player: String(ps[0]._id),
      type: "ownGoal",
      minute: 10,
    });
    expect(goal.status).toBe(201); // ps[0] is away, so own goal credits home.
    expect(
      (
        await call("put", `/matches/${m._id}/result`, adminToken, {
          status: "completed",
          homeScore: 0,
          awayScore: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("put", `/matches/${m._id}/result`, adminToken, {
          status: "completed",
          homeScore: 1,
          awayScore: 0,
        })
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/matches/${m._id}`)).body.data.homeScore,
    ).toBe(1);
    await call("put", `/match-events/${goal.body.data._id}`, adminToken, {
      player: String(ps[0]._id),
      type: "goal",
      minute: 10,
    });
    const corrected = (await request(app).get(`/api/matches/${m._id}`)).body
      .data;
    expect([corrected.homeScore, corrected.awayScore]).toEqual([0, 1]);
    await call("delete", `/match-events/${goal.body.data._id}`, adminToken);
    expect(
      (await request(app).get(`/api/matches/${m._id}`)).body.data.awayScore,
    ).toBe(0);
  });
  it("prevents clean-sheet duplicates and credits conflicting with goals", async () => {
    const t = await tournament("active"),
      { a, b, ps } = await roster(t);
    const m = await Match.create({
      tournament: t._id,
      homeTeam: a._id,
      awayTeam: b._id,
      scheduledAt: new Date(),
      status: "live",
      homeScore: 0,
      awayScore: 0,
    });
    const path = `/matches/${m._id}/events`;
    expect(
      (
        await call("post", path, adminToken, {
          player: String(ps[0]._id),
          type: "cleanSheet",
          minute: 60,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call("post", path, adminToken, {
          player: String(ps[0]._id),
          type: "cleanSheet",
          minute: 70,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("post", path, adminToken, {
          player: String(ps[1]._id),
          type: "goal",
          minute: 30,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("post", path, adminToken, {
          player: String(ps[4]._id),
          type: "cleanSheet",
          minute: 60,
        })
      ).status,
    ).toBe(400);
  });
  it("lets admins inspect draft fixtures and cancel upcoming fixtures", async () => {
    const t = await tournament("draft"),
      { a, b } = await roster(t);
    const m = await Match.create({
      tournament: t._id,
      homeTeam: a._id,
      awayTeam: b._id,
      scheduledAt: new Date(Date.now() + 86400000),
      homeScore: 0,
      awayScore: 0,
    });
    expect((await call("get", `/matches/${m._id}`, adminToken)).status).toBe(
      200,
    );
    expect((await call("get", `/matches/${m._id}`, userToken)).status).toBe(
      404,
    );
    expect(
      (
        await call("put", `/matches/${m._id}/result`, adminToken, {
          status: "cancelled",
          homeScore: 0,
          awayScore: 0,
        })
      ).status,
    ).toBe(200);
  });
  it("rejects signed tokens with malformed subjects", async () => {
    const token = jwt.sign({ sub: "not-an-id" }, process.env.JWT_SECRET, {
      issuer: "sfl-fantasy",
    });
    expect((await call("get", "/auth/me", token)).status).toBe(401);
  });
});

describe("Maintenance scripts", () => {
  it("seeds fictional data idempotently without deleting existing records", async () => {
    const run = promisify(execFile);
    const opts = { env: { ...process.env, MONGODB_URI: testUri } };
    await run(process.execPath, ["server/scripts/seed.js"], opts);
    const before = {
      users: await User.countDocuments(),
      tournaments: await Tournament.countDocuments(),
      teams: await Team.countDocuments(),
      players: await Player.countDocuments(),
    };
    expect(before).toEqual({ users: 4, tournaments: 2, teams: 8, players: 96 });
    await run(process.execPath, ["server/scripts/seed.js"], opts);
    expect({
      users: await User.countDocuments(),
      tournaments: await Tournament.countDocuments(),
      teams: await Team.countDocuments(),
      players: await Player.countDocuments(),
    }).toEqual(before);
    expect(await User.countDocuments({ role: "admin" })).toBe(1);
    const teams = new Set((await Team.find()).map((t) => String(t._id)));
    expect((await Player.find()).every((p) => teams.has(String(p.team)))).toBe(
      true,
    );
  });
  it("bootstraps only an explicitly configured new admin and refuses account promotion", async () => {
    const run = promisify(execFile);
    const env = {
      ...process.env,
      MONGODB_URI: testUri,
      ADMIN_NAME: "Bootstrap test admin",
      ADMIN_EMAIL: "bootstrap@example.test",
      ADMIN_PASSWORD: "Bootstrap-test-password-2026",
    };
    await run(process.execPath, ["server/scripts/admin.js"], { env });
    const admin = await User.findOne({ email: env.ADMIN_EMAIL }).select(
      "+passwordHash",
    );
    expect(admin.role).toBe("admin");
    expect(await bcrypt.compare(env.ADMIN_PASSWORD, admin.passwordHash)).toBe(
      true,
    );
    await expect(
      run(process.execPath, ["server/scripts/admin.js"], { env }),
    ).rejects.toThrow();
    await expect(
      run(process.execPath, ["server/scripts/admin.js"], {
        env: { ...env, ADMIN_EMAIL: "user@example.test" },
      }),
    ).rejects.toThrow();
    expect((await User.findOne({ email: "user@example.test" })).role).toBe(
      "user",
    );
  });
});
