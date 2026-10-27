import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerTournamentsRoutes } from "./routes/tournaments.js";
import { registerRosterRoutes } from "./routes/roster.js";
import { registerSquadsRoutes } from "./routes/squads.js";
import { registerMatchesRoutes } from "./routes/matches.js";
import { registerEventsRoutes } from "./routes/events.js";
import { registerPerformanceRoutes } from "./routes/performance.js";

export const app = express();

app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: (origin, cb) =>
      cb(
        null,
        !origin ||
          (
            process.env.CLIENT_ORIGIN ||
            "http://localhost:5173,http://127.0.0.1:5173"
          )
            .split(",")
            .includes(origin),
      ),
  }),
);

app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (req, res) =>
  res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
    data: {
      status:
        mongoose.connection.readyState === 1 ? "ok" : "database unavailable",
    },
  }),
);

app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        error: {
          message: "Too many authentication attempts. Please try again later.",
        },
      }),
  }),
);

registerAuthRoutes(app);
registerTournamentsRoutes(app);
registerRosterRoutes(app);
registerSquadsRoutes(app);
registerMatchesRoutes(app);
registerEventsRoutes(app);
registerPerformanceRoutes(app);

app.use("/api", (req, res) =>
  res.status(404).json({ error: { message: "API route not found" } }),
);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err.status || 400;
  let message = err.message;
  if (err instanceof ZodError)
    message = err.issues
      .map((i) => `${i.path.join(".") || "Request"}: ${i.message}`)
      .join("; ");
  else if (err.code === 11000) {
    status = 409;
    message = "This record already exists.";
  } else if (err.name === "VersionError") {
    status = 409;
    message = "Record changed. Reload and try again.";
  } else if (
    !err.status &&
    !(err instanceof ZodError) &&
    !["ValidationError", "CastError", "SyntaxError"].includes(err.name)
  ) {
    status = 500;
    message = "Unable to complete request";
    console.error("API error:", err.name);
  }
  res.status(status).json({ error: { message } });
});
