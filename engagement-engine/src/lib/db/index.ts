import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "@/lib/env";
import { connectionString, sslOptions } from "./ssl";

/**
 * Two ways to talk to the database:
 *
 *  - withUser(userId, fn): every query runs as role gbs_app with app.user_id set,
 *    so Row Level Security filters each statement. Use for all request work.
 *  - withSystem(fn): the service connection, used only for authentication,
 *    token storage, notifications and background jobs, which scope by client_id.
 */
export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null>;
  readonly userId: string | null;
}

const globalForPool = globalThis as unknown as { __gbsPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__gbsPool) {
    globalForPool.__gbsPool = new Pool({
      connectionString: connectionString(env().DATABASE_URL),
      ssl: sslOptions(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForPool.__gbsPool;
}

export function wrap(client: PoolClient, userId: string | null): Db {
  return {
    userId,
    async query(sql, params) {
      const res = await client.query(sql, params as unknown[]);
      return res.rows;
    },
    async one(sql, params) {
      const res = await client.query(sql, params as unknown[]);
      return res.rows[0] ?? null;
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withUserOn<T>(pool: Pool, userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!UUID.test(userId)) throw new Error("invalid user id");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    await client.query("set local role gbs_app");
    const result = await fn(wrap(client, userId));
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function withSystemOn<T>(pool: Pool, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(wrap(client, null));
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const withUser = <T>(userId: string, fn: (db: Db) => Promise<T>) => withUserOn(getPool(), userId, fn);
export const withSystem = <T>(fn: (db: Db) => Promise<T>) => withSystemOn(getPool(), fn);

/** Postgres error code for RLS / privilege / guard-trigger refusals. */
export function isPermissionError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === "42501";
}

/** Runs a function inside a transaction (user-scoped or system). Lets engine code work in both contexts. */
export type DbRunner = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

export const userRunner = (userId: string): DbRunner => (fn) => withUser(userId, fn);
export const systemRunner: DbRunner = (fn) => withSystem(fn);
