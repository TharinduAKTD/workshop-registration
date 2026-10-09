import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { config } from "./config.js";
import { pool } from "./db.js";
import { asyncRoute, HttpError } from "./http.js";

export type Role = "ADMIN" | "MANAGER" | "STAFF";
export type User = { id: number; name: string; email: string; role: Role };
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const authenticate = asyncRoute(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    throw new HttpError(401, "Please sign in");
  let subject: string | undefined;
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret, {
      algorithms: ["HS256"],
    });
    if (typeof payload !== "string") subject = payload.sub;
  } catch {
    throw new HttpError(401, "Session expired. Please sign in again");
  }
  if (!subject || !/^\d+$/.test(subject))
    throw new HttpError(401, "Invalid session");
  // Load the current role from the DB rather than trusting a role stored in a token.
  const result = await pool.query<User>(
    "SELECT id, name, email, role FROM users WHERE id=$1",
    [subject],
  );
  if (!result.rowCount) throw new HttpError(401, "Account not found");
  req.user = result.rows[0];
  next();
});

export const allow =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, "Please sign in"));
    if (!roles.includes(req.user.role))
      return next(new HttpError(403, "Your role cannot perform this action"));
    next();
  };
