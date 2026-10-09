import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({
  ...config.db,
  max: 20,
  connectionTimeoutMillis: 5000,
});
pool.on("error", (error) =>
  console.error("Idle database connection error:", error.message),
);

// Every statement in a transaction must use this same checked-out client.
export async function transaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
