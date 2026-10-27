import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { check } from "../services/rules.js";
export async function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ");
    check(token?.[0] === "Bearer" && token[1], "Authentication required", 401);
    let payload;
    try {
      payload = jwt.verify(token[1], process.env.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "sfl-fantasy",
      });
    } catch {
      check(false, "Session expired or invalid. Please sign in again.", 401);
    }
    check(
      typeof payload.sub === "string" && /^[a-fA-F0-9]{24}$/.test(payload.sub),
      "Session invalid",
      401,
    );
    req.user = await User.findById(payload.sub);
    check(req.user, "Session invalid", 401);
    next();
  } catch (e) {
    next(e);
  }
}
export function admin(req, res, next) {
  try {
    check(req.user.role === "admin", "Administrator access required", 403);
    next();
  } catch (e) {
    next(e);
  }
}
