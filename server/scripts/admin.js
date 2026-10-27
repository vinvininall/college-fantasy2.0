import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { z } from "zod";
import { User } from "../models/index.js";
const config = z
  .object({
    ADMIN_NAME: z.string().min(2),
    ADMIN_EMAIL: z.email().transform((v) => v.toLowerCase()),
    ADMIN_PASSWORD: z.string().min(7).max(72),
    MONGODB_URI: z.string().min(1),
  })
  .parse(process.env);
if (Buffer.byteLength(config.ADMIN_PASSWORD) > 72)
  throw new Error("Admin password must be at most 72 UTF-8 bytes");
try {
  await mongoose.connect(config.MONGODB_URI);
  if (await User.exists({ email: config.ADMIN_EMAIL }))
    throw new Error(
      "Account already exists. Bootstrap refuses to modify existing accounts.",
    );
  await User.create({
    name: config.ADMIN_NAME,
    email: config.ADMIN_EMAIL,
    passwordHash: await bcrypt.hash(config.ADMIN_PASSWORD, 12),
    role: "admin",
  });
  console.log("Administrator created. Remove ADMIN_PASSWORD from environment.");
} finally {
  await mongoose.disconnect();
}
