import "dotenv/config";
import mongoose from "mongoose";
import { app } from "./app.js";
if (
  !process.env.MONGODB_URI ||
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
)
  throw new Error("Set MONGODB_URI and JWT_SECRET (at least 32 characters)");
if (process.env.NODE_ENV === "production" && !process.env.CLIENT_ORIGIN)
  throw new Error("Production requires CLIENT_ORIGIN");
try {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const server = app.listen(Number(process.env.PORT) || 4000, () =>
    console.log(`SFL API listening on port ${process.env.PORT || 4000}`),
  );
  const close = () =>
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
} catch (e) {
  console.error("Database startup failed:", e.name);
  process.exit(1);
}
