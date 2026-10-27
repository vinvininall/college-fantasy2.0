import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { User } from "../models/index.js";
import { auth } from "../middleware/auth.js";
import { check } from "../services/rules.js";

import { send } from "../services/resources.js";
import { mutate } from "../middleware/mutations.js";

export function registerAuthRoutes(app) {
  const publicUser = (u) => ({
    _id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
  });

  const session = (u) => ({
    user: publicUser(u),
    token: jwt.sign({}, process.env.JWT_SECRET, {
      subject: String(u._id),
      expiresIn: "8h",
      issuer: "sfl-fantasy",
      algorithm: "HS256",
    }),
  });

  const credentials = z.object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase().trim()),
    password: z.string().min(7).max(72),
  });

  mutate(app, "post", "/api/auth/register", async (req, res) => {
    const v = credentials
      .extend({ name: z.string().trim().min(2).max(80) })
      .strict()
      .parse(req.body);
    check(
      Buffer.byteLength(v.password) <= 72,
      "Password must be at most 72 UTF-8 bytes",
    );
    const user = await User.create({
      name: v.name,
      email: v.email,
      passwordHash: await bcrypt.hash(v.password, 12),
    });
    send(res, session(user), 201);
  });

  mutate(app, "post", "/api/auth/login", async (req, res) => {
    const v = credentials.strict().parse(req.body);
    const u = await User.findOne({ email: v.email }).select("+passwordHash");
    const valid = await bcrypt.compare(
      v.password,
      u?.passwordHash ||
        "$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
    );
    check(u && valid, "Invalid email or password", 401);
    send(res, session(u));
  });

  app.get("/api/auth/me", auth, (req, res) => send(res, publicUser(req.user)));
}
