import "dotenv/config";
import mongoose from "mongoose";
import { Tournament, Team, Player, User } from "../models/index.js";
import { scoringDefaults } from "../services/rules.js";
if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI");
try {
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([
    Tournament.init(),
    Team.init(),
    Player.init(),
    User.init(),
  ]);
  let owner = await User.findOne({
    email: "fictional-demo-owner@example.invalid",
  });
  if (!owner)
    owner = await User.create({
      name: "Fictional demo organizer",
      email: "fictional-demo-owner@example.invalid",
      passwordHash: "!DISABLED",
      role: "user",
    });
  for (const [key, format, budget, starters, subs, formation] of [
    [
      "demo-7",
      "7v7",
      15000000,
      7,
      3,
      { name: "2–3–1", GK: 1, DEF: 2, MID: 3, FWD: 1 },
    ],
    [
      "demo-6",
      "6v6",
      20000000,
      6,
      2,
      { name: "2–2–1", GK: 1, DEF: 2, MID: 2, FWD: 1 },
    ],
  ]) {
    const t = await Tournament.findOneAndUpdate(
      { demoKey: key },
      {
        $setOnInsert: {
          demoKey: key,
          name: `Fictional Campus Cup • ${format}`,
          college: "Demo Institute of Sport (fictional)",
          description:
            "Fictional demonstration data. These teams and players are not actual college or SFL records.",
          format,
          playersPerSide: parseInt(format),
          budget,
          startingPlayers: starters,
          substitutes: subs,
          squadSize: starters + subs,
          formations: [formation],
          formationPolicy: "configured",
          scoring: scoringDefaults,
          status: "upcoming",
          registrationEnabled: true,
          creator: owner._id,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    for (const [n, short] of [
      ["North Falcons", "NFL"],
      ["South Wolves", "SWL"],
      ["East Rovers", "ERV"],
      ["West United", "WUN"],
    ]) {
      const team = await Team.findOneAndUpdate(
        { tournament: t._id, shortName: short },
        { $setOnInsert: { name: n, shortName: short, tournament: t._id } },
        { upsert: true, new: true },
      );
      for (let i = 0; i < 12; i++) {
        const position = [
          "GK",
          "DEF",
          "DEF",
          "MID",
          "MID",
          "MID",
          "FWD",
          "GK",
          "DEF",
          "MID",
          "FWD",
          "FWD",
        ][i];
        const demoKey = `${key}-${short}-${i}`;
        await Player.updateOne(
          { demoKey },
          {
            $setOnInsert: {
              demoKey,
              name: `${["Aarav", "Kabir", "Vihaan", "Ishaan", "Arjun", "Dev", "Rohan", "Neel", "Reyansh", "Yash", "Aditya", "Kian"][i]} ${short}`,
              team: team._id,
              position,
              jerseyNumber: i + 1,
              auctionPrice: 400000 + i * 50000,
              fantasyPrice: 500000 + i * 50000,
            },
          },
          { upsert: true },
        );
      }
    }
  }
  console.log(
    "Fictional demo data ready. No existing records changed or deleted.",
  );
} finally {
  await mongoose.disconnect();
}
