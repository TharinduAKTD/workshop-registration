import "dotenv/config";

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32)
  throw new Error(
    "JWT_SECRET must contain at least 32 characters. Copy .env.example to .env first.",
  );

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: secret,
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  db: {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || "workshop_registration",
  },
};
