import { app } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";

await pool.query("SELECT 1");
const server = app.listen(config.port, () =>
  console.log(`API running at http://localhost:${config.port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      pool.end().then(() => process.exit(0));
    });
  });
}
