import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import { config } from "../src/config.js";

// CREATE DATABASE cannot run inside a transaction. Connect to the maintenance DB first.
const name = config.db.database;
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))
  throw new Error(
    "Use a simple PGDATABASE name containing letters, numbers and underscores.",
  );
const admin = new pg.Client({ ...config.db, database: "postgres" });
try {
  await admin.connect();
  const existing = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (!existing.rowCount) {
    await admin.query(`CREATE DATABASE "${name}"`);
    console.log(`Created database ${name}`);
  }
} finally {
  await admin.end();
}

const db = new pg.Client(config.db);
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query(
    await readFile(new URL("../schema.sql", import.meta.url), "utf8"),
  );
  const password = process.env.ADMIN_PASSWORD || "Admin123!";
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72)
    throw new Error(
      "ADMIN_PASSWORD must have at least 8 characters and at most 72 UTF-8 bytes",
    );
  await db.query(
    `INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'ADMIN') ON CONFLICT(email) DO NOTHING`,
    [
      process.env.ADMIN_NAME || "Development Admin",
      (process.env.ADMIN_EMAIL || "admin@workshop.local").trim().toLowerCase(),
      await bcrypt.hash(password, 12),
    ],
  );
  for (const [code, title, instructor, location, days, capacity] of [
    ["POT-001", "Pottery for beginners", "Maya Perera", "Colombo", 2, 12],
    ["CODE-001", "Introduction to coding", "Nimal Silva", "Nugegoda", 3, 20],
    ["FIT-001", "Morning fitness", "Asha Fernando", "Rajagiriya", 4, 8],
  ] as const) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(10, 0, 0, 0);
    await db.query(
      `INSERT INTO workshops(code,title,instructor,location,starts_at,capacity,status)
      VALUES($1,$2,$3,$4,$5,$6,'OPEN') ON CONFLICT(code) DO NOTHING`,
      [code, title, instructor, location, date.toISOString(), capacity],
    );
  }
  await db.query("COMMIT");
  console.log(
    "Schema ready. Admin and three sample workshops seeded. Existing records were preserved.",
  );
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
