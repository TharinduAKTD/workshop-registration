import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config.js";
import { pool, transaction } from "./db.js";
import { authenticate, allow, type User } from "./auth.js";
import { asyncRoute, HttpError, parse, idParam } from "./http.js";
import type { ErrorRequestHandler } from "express";

const email = z.string().trim().toLowerCase().email().max(254);
const name = z.string().trim().min(1).max(100);
const role = z.enum(["ADMIN", "MANAGER", "STAFF"]);
const passwordInput = z
  .string()
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must fit in 72 UTF-8 bytes",
  );
const workshopSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(150),
    instructor: name,
    location: name,
    startsAt: z.string().datetime({ offset: true }),
    capacity: z.number().int().min(1).max(100000),
    status: z.enum(["OPEN", "CLOSED", "CANCELLED", "COMPLETED"]),
  })
  .strict();

export const app = express();
app.use(helmet());
app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json({ limit: "32kb" }));

app.get(
  "/api/health",
  asyncRoute(async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  }),
);

app.post(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many login attempts. Try again later." },
  }),
  asyncRoute(async (req, res) => {
    const input = parse(
      z
        .object({
          email,
          password: passwordInput.refine(
            (value) => value.length >= 1,
            "Password is required",
          ),
        })
        .strict(),
      req.body,
    );
    const result = await pool.query<User & { password_hash: string }>(
      "SELECT * FROM users WHERE email=$1",
      [input.email],
    );
    const found = result.rows[0];
    if (!found || !(await bcrypt.compare(input.password, found.password_hash)))
      throw new HttpError(401, "Incorrect email or password");
    const user: User = {
      id: found.id,
      name: found.name,
      email: found.email,
      role: found.role,
    };
    res.json({
      token: jwt.sign({}, config.jwtSecret, {
        subject: String(user.id),
        expiresIn: "8h",
        algorithm: "HS256",
      }),
      user,
    });
  }),
);

app.use("/api", authenticate);
app.get("/api/auth/me", (req, res) => {
  res.json(req.user);
});

app.get(
  "/api/users",
  allow("ADMIN"),
  asyncRoute(async (_req, res) => {
    res.json(
      (
        await pool.query(
          "SELECT id,name,email,role,created_at FROM users ORDER BY id",
        )
      ).rows,
    );
  }),
);
app.post(
  "/api/users",
  allow("ADMIN"),
  asyncRoute(async (req, res) => {
    const input = parse(
      z
        .object({
          name,
          email,
          password: passwordInput.refine(
            (value) => value.length >= 8,
            "Use at least 8 characters",
          ),
          role,
        })
        .strict(),
      req.body,
    );
    const hash = await bcrypt.hash(input.password, 12);
    const result = await pool.query(
      `INSERT INTO users(name,email,password_hash,role,created_by)
    VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role,created_at`,
      [input.name, input.email, hash, input.role, req.user!.id],
    );
    res.status(201).json(result.rows[0]);
  }),
);
app.patch(
  "/api/users/:id/role",
  allow("ADMIN"),
  asyncRoute(async (req, res) => {
    const id = idParam(req.params.id);
    const input = parse(z.object({ role }).strict(), req.body);
    // Prevent an admin from losing their own access accidentally.
    if (id === req.user!.id && input.role !== "ADMIN")
      throw new HttpError(400, "You cannot remove your own Admin role");
    const result = await pool.query(
      "UPDATE users SET role=$1 WHERE id=$2 RETURNING id,name,email,role,created_at",
      [input.role, id],
    );
    if (!result.rowCount) throw new HttpError(404, "User not found");
    res.json(result.rows[0]);
  }),
);

// Admin is intentionally excluded from all workshop/registration operations.
app.get(
  "/api/workshops",
  allow("MANAGER", "STAFF"),
  asyncRoute(async (req, res) => {
    const filter = parse(
      z
        .object({
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          status: z
            .enum(["OPEN", "CLOSED", "CANCELLED", "COMPLETED"])
            .optional(),
          availableOnly: z.enum(["true", "false"]).optional(),
        })
        .strict(),
      req.query,
    );
    for (const d of [filter.from, filter.to]) {
      if (
        d &&
        (Number.isNaN(Date.parse(d)) ||
          new Date(d).toISOString().slice(0, 10) !== d)
      )
        throw new HttpError(400, "Invalid calendar date");
    }
    if (filter.from && filter.to && filter.from > filter.to)
      throw new HttpError(400, "Start date must be before end date");
    const result = await pool.query(
      `SELECT w.*, COALESCE(a.active_count,0)::int AS active_count,
    (w.capacity - COALESCE(a.active_count,0))::int AS available_seats
    FROM workshops w
    LEFT JOIN (SELECT workshop_id, COUNT(*) AS active_count FROM registrations WHERE status='ACTIVE' GROUP BY workshop_id) a
      ON a.workshop_id=w.id
    WHERE ($1::date IS NULL OR w.starts_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Colombo'))
      AND ($2::date IS NULL OR w.starts_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Colombo'))
      AND ($3::text IS NULL OR w.status=$3)
      AND ($4::boolean=false OR (w.status='OPEN' AND w.capacity > COALESCE(a.active_count,0)))
    ORDER BY w.starts_at,w.id`,
      [
        filter.from || null,
        filter.to || null,
        filter.status || null,
        filter.availableOnly === "true",
      ],
    );
    res.json(result.rows);
  }),
);

app.post(
  "/api/workshops",
  allow("MANAGER"),
  asyncRoute(async (req, res) => {
    const w = parse(workshopSchema, req.body);
    const result = await pool.query(
      `INSERT INTO workshops(code,title,instructor,location,starts_at,capacity,status,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        w.code,
        w.title,
        w.instructor,
        w.location,
        w.startsAt,
        w.capacity,
        w.status,
        req.user!.id,
      ],
    );
    res.status(201).json(result.rows[0]);
  }),
);

app.put(
  "/api/workshops/:id",
  allow("MANAGER"),
  asyncRoute(async (req, res) => {
    const id = idParam(req.params.id);
    const w = parse(workshopSchema, req.body);
    const result = await transaction(async (client) => {
      const locked = await client.query(
        "SELECT id FROM workshops WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!locked.rowCount) throw new HttpError(404, "Workshop not found");
      const active = await client.query(
        "SELECT COUNT(*)::int AS count FROM registrations WHERE workshop_id=$1 AND status='ACTIVE'",
        [id],
      );
      if (w.capacity < active.rows[0].count)
        throw new HttpError(
          409,
          "Capacity cannot be less than the active registration count",
        );
      return (
        await client.query(
          `UPDATE workshops SET code=$1,title=$2,instructor=$3,location=$4,starts_at=$5,
      capacity=$6,status=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
          [
            w.code,
            w.title,
            w.instructor,
            w.location,
            w.startsAt,
            w.capacity,
            w.status,
            id,
          ],
        )
      ).rows[0];
    });
    res.json(result);
  }),
);

app.get(
  "/api/workshops/:id/registrations",
  allow("MANAGER", "STAFF"),
  asyncRoute(async (req, res) => {
    const id = idParam(req.params.id);
    if (
      !(await pool.query("SELECT 1 FROM workshops WHERE id=$1", [id])).rowCount
    )
      throw new HttpError(404, "Workshop not found");
    res.json(
      (
        await pool.query(
          `SELECT r.*, u.name AS registered_by_name, c.name AS cancelled_by_name
    FROM registrations r JOIN users u ON u.id=r.registered_by LEFT JOIN users c ON c.id=r.cancelled_by
    WHERE r.workshop_id=$1 ORDER BY r.registered_at DESC,r.id DESC`,
          [id],
        )
      ).rows,
    );
  }),
);

app.post(
  "/api/workshops/:id/registrations",
  allow("MANAGER", "STAFF"),
  asyncRoute(async (req, res) => {
    const id = idParam(req.params.id);
    const input = parse(
      z.object({ attendeeName: name, attendeeEmail: email }).strict(),
      req.body,
    );
    const registration = await transaction(async (client) => {
      // Both competing registrations lock the SAME parent row, including when there are zero registrations.
      const locked = await client.query(
        "SELECT id,capacity,status FROM workshops WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!locked.rowCount) throw new HttpError(404, "Workshop not found");
      const workshop = locked.rows[0];
      if (workshop.status !== "OPEN")
        throw new HttpError(409, "This workshop is not open for registration");
      // Separate query AFTER acquiring the lock: READ COMMITTED sees the preceding transaction's insert.
      const count = await client.query(
        "SELECT COUNT(*)::int AS count FROM registrations WHERE workshop_id=$1 AND status='ACTIVE'",
        [id],
      );
      if (count.rows[0].count >= workshop.capacity)
        throw new HttpError(409, "Workshop is full. No seats available");
      const result = await client.query(
        `INSERT INTO registrations(workshop_id,attendee_name,attendee_email,registered_by)
      VALUES($1,$2,$3,$4) RETURNING *`,
        [id, input.attendeeName, input.attendeeEmail, req.user!.id],
      );
      await client.query(
        "INSERT INTO registration_events(registration_id,action,actor_id) VALUES($1,'REGISTERED',$2)",
        [result.rows[0].id, req.user!.id],
      );
      return result.rows[0];
    });
    res.status(201).json(registration);
  }),
);

app.post(
  "/api/registrations/:id/cancel",
  allow("MANAGER", "STAFF"),
  asyncRoute(async (req, res) => {
    const id = idParam(req.params.id);
    const result = await transaction(async (client) => {
      const found = await client.query(
        "SELECT workshop_id FROM registrations WHERE id=$1",
        [id],
      );
      if (!found.rowCount) throw new HttpError(404, "Registration not found");
      // Registration, cancellation and capacity edits always lock the workshop first.
      await client.query("SELECT id FROM workshops WHERE id=$1 FOR UPDATE", [
        found.rows[0].workshop_id,
      ]);
      const current = (
        await client.query("SELECT * FROM registrations WHERE id=$1", [id])
      ).rows[0];
      if (current.status === "CANCELLED") return current; // Repeat cancellation is harmless; no duplicate event.
      const changed = await client.query(
        `UPDATE registrations SET status='CANCELLED',cancelled_by=$1,cancelled_at=NOW()
      WHERE id=$2 RETURNING *`,
        [req.user!.id, id],
      );
      await client.query(
        "INSERT INTO registration_events(registration_id,action,actor_id) VALUES($1,'CANCELLED',$2)",
        [id, req.user!.id],
      );
      return changed.rows[0];
    });
    res.json(result);
  }),
);

app.get(
  "/api/registrations/:id/history",
  allow("MANAGER", "STAFF"),
  asyncRoute(async (req, res) => {
    const id = idParam(req.params.id);
    if (
      !(await pool.query("SELECT 1 FROM registrations WHERE id=$1", [id]))
        .rowCount
    )
      throw new HttpError(404, "Registration not found");
    res.json(
      (
        await pool.query(
          `SELECT e.id,e.action,e.occurred_at,u.id AS actor_id,u.name AS actor_name
    FROM registration_events e JOIN users u ON u.id=e.actor_id WHERE e.registration_id=$1 ORDER BY e.id`,
          [id],
        )
      ).rows,
    );
  }),
);

app.use((_req, _res, next) => next(new HttpError(404, "Endpoint not found")));
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ message: "Invalid JSON body" });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({ message: "Request body too large" });
    return;
  }
  if (error?.code === "23505") {
    const message =
      error.constraint === "registrations_active_email"
        ? "This email already has an active registration for this workshop"
        : error.constraint === "users_email_key"
          ? "An account already exists for this email"
          : "Workshop code already exists";
    res.status(409).json({ message });
    return;
  }
  console.error(error);
  res.status(500).json({ message: "Something went wrong. Please try again" });
};
app.use(errorHandler);
