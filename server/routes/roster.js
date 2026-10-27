import { z } from "zod";
import {
  Team,
  Player,
  FantasySquad,
  Match,
  MatchEvent,
} from "../models/index.js";
import { auth, admin } from "../middleware/auth.js";
import { check, teamSchema, playerSchema } from "../services/rules.js";

import {
  send,
  id,
  page,
  find,
  visible,
  privateTournament,
  rosterEditable,
} from "../services/resources.js";
import { mutate } from "../middleware/mutations.js";

const rosterImportSchema = z
  .object({
    teams: z
      .array(
        teamSchema
          .extend({ players: z.array(playerSchema).max(100).default([]) })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine(({ teams }, context) => {
    if (teams.reduce((total, team) => total + team.players.length, 0) > 1000)
      context.addIssue({
        code: "custom",
        path: ["teams"],
        message: "Import cannot contain more than 1000 players",
      });

    const names = new Set();
    const shortNames = new Set();
    teams.forEach((team, index) => {
      const name = team.name.toLocaleLowerCase();
      const shortName = team.shortName.toUpperCase();
      if (names.has(name))
        context.addIssue({
          code: "custom",
          path: ["teams", index, "name"],
          message: "Team names must be unique within the import",
        });
      if (shortNames.has(shortName))
        context.addIssue({
          code: "custom",
          path: ["teams", index, "shortName"],
          message: "Team short names must be unique within the import",
        });
      names.add(name);
      shortNames.add(shortName);
    });
  });

export function registerRosterRoutes(app) {
  app.get(
    "/api/tournaments/:tournamentId/teams",
    privateTournament,
    async (req, res) =>
      send(
        res,
        await Team.find({ tournament: req.tournament._id })
          .sort({ name: 1 })
          .skip(page(req).skip)
          .limit(page(req).limit),
      ),
  );

  mutate(
    app,
    "post",
    "/api/tournaments/:tournamentId/roster/import",
    auth,
    admin,
    async (req, res) => {
      const tournament = await rosterEditable(req.params.tournamentId);
      const { teams: input } = rosterImportSchema.parse(req.body);
      const existing = await Team.find({ tournament: tournament._id })
        .select("name shortName")
        .collation({ locale: "en", strength: 2 });
      const existingNames = new Set(
        existing.map((team) => team.name.toLocaleLowerCase()),
      );
      const existingShortNames = new Set(
        existing.map((team) => team.shortName.toUpperCase()),
      );
      check(
        input.every(
          (team) =>
            !existingNames.has(team.name.toLocaleLowerCase()) &&
            !existingShortNames.has(team.shortName.toUpperCase()),
        ),
        "A team name or short name already exists in this tournament",
        409,
      );

      const teamDocs = input.map(({ players, ...team }) => ({
        ...team,
        tournament: tournament._id,
      }));
      const insertedTeams = teamDocs.map((team) => new Team(team));
      const teamIds = insertedTeams.map((team) => team._id);
      const playerDocs = input.flatMap((team, index) =>
        team.players.map((player) => ({
          ...player,
          team: teamIds[index],
        })),
      );
      try {
        await Team.insertMany(insertedTeams);
        if (playerDocs.length) await Player.insertMany(playerDocs);
      } catch (error) {
        await Promise.all([
          Player.deleteMany({ team: { $in: teamIds } }),
          Team.deleteMany({ _id: { $in: teamIds } }),
        ]);
        throw error;
      }
      send(
        res,
        { teams: insertedTeams.length, players: playerDocs.length },
        201,
      );
    },
  );

  mutate(
    app,
    "post",
    "/api/tournaments/:tournamentId/teams",
    auth,
    admin,
    async (req, res) => {
      await rosterEditable(req.params.tournamentId);
      send(
        res,
        await Team.create({
          ...teamSchema.parse(req.body),
          tournament: req.params.tournamentId,
        }),
        201,
      );
    },
  );

  app.get("/api/teams/:teamId", async (req, res) => {
    const t = await find(Team, req.params.teamId);
    await visible(String(t.tournament), req);
    send(res, t);
  });

  mutate(app, "put", "/api/teams/:teamId", auth, admin, async (req, res) => {
    const t = await find(Team, req.params.teamId);
    await rosterEditable(t.tournament);
    Object.assign(t, teamSchema.parse(req.body));
    send(res, await t.save());
  });

  mutate(app, "delete", "/api/teams/:teamId", auth, admin, async (req, res) => {
    const t = await find(Team, req.params.teamId);
    await rosterEditable(t.tournament);
    check(
      !(await Player.exists({ team: t._id })) &&
        !(await Match.exists({
          $or: [{ homeTeam: t._id }, { awayTeam: t._id }],
        })),
      "Team has players or fixtures",
      409,
    );
    await t.deleteOne();
    send(res, { deleted: true });
  });

  app.get("/api/teams/:teamId/players", async (req, res) => {
    const t = await find(Team, req.params.teamId);
    await visible(String(t.tournament), req);
    send(
      res,
      await Player.find({ team: t._id })
        .skip(page(req).skip)
        .limit(page(req).limit),
    );
  });

  app.get(
    "/api/tournaments/:tournamentId/players",
    privateTournament,
    async (req, res) => {
      const teams = await Team.find({
        tournament: req.tournament._id,
      }).distinct("_id");
      const filter = { team: { $in: teams } };
      if (req.query.team) {
        id.parse(req.query.team);
        check(
          teams.some((t) => String(t) === req.query.team),
          "Team is outside tournament",
        );
        filter.team = req.query.team;
      }
      if (req.query.position)
        filter.position = z
          .enum(["GK", "DEF", "MID", "FWD"])
          .parse(req.query.position);
      if (req.query.search) {
        const search = z.string().max(80).parse(req.query.search);
        filter.name = {
          $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        };
      }
      send(
        res,
        await Player.find(filter)
          .populate("team", "name shortName")
          .sort({ position: 1, name: 1 })
          .skip(page(req).skip)
          .limit(page(req).limit),
      );
    },
  );

  mutate(
    app,
    "post",
    "/api/teams/:teamId/players",
    auth,
    admin,
    async (req, res) => {
      const t = await find(Team, req.params.teamId);
      await rosterEditable(t.tournament);
      send(
        res,
        await Player.create({ ...playerSchema.parse(req.body), team: t._id }),
        201,
      );
    },
  );

  app.get("/api/players/:playerId", async (req, res) => {
    const p = await find(Player, req.params.playerId);
    const t = await find(Team, String(p.team));
    await visible(String(t.tournament), req);
    send(res, await p.populate("team", "name shortName tournament"));
  });

  mutate(
    app,
    "put",
    "/api/players/:playerId",
    auth,
    admin,
    async (req, res) => {
      const p = await find(Player, req.params.playerId);
      const t = await find(Team, String(p.team));
      await rosterEditable(t.tournament);
      Object.assign(p, playerSchema.parse(req.body));
      send(res, await p.save());
    },
  );

  mutate(
    app,
    "delete",
    "/api/players/:playerId",
    auth,
    admin,
    async (req, res) => {
      const p = await find(Player, req.params.playerId);
      const t = await find(Team, String(p.team));
      await rosterEditable(t.tournament);
      check(
        !(await FantasySquad.exists({ players: p._id })) &&
          !(await MatchEvent.exists({ player: p._id })),
        "Player is referenced by squad or history",
        409,
      );
      await p.deleteOne();
      send(res, { deleted: true });
    },
  );
}
