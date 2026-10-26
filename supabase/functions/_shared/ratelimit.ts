// Wrapper around public.hit_rate_limit(p_key, p_max, p_window_seconds), a fixed window counter.
import { HttpError } from "./errors.ts";
import { isDbDown } from "./http.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

function check(key: string, max: number, windowSeconds: number) {
  if (typeof key !== "string" || key.length < 1 || key.length > 200) throw new RangeError("rate limit key must be 1 to 200 characters");
  if (!Number.isInteger(max) || max < 1) throw new RangeError("max must be a positive integer");
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) throw new RangeError("windowSeconds must be a positive integer");
}

/**
 * True while the caller is inside the limit, false once they are over it.
 * A database failure throws a 500 (not a 429): the limiter being down must not look like the caller's fault,
 * and it must not silently let the request through either.
 */
export async function hitRateLimit(db: Db, key: string, max: number, windowSeconds: number): Promise<boolean> {
  check(key, max, windowSeconds);
  const r = await db.rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (r.error && isDbDown(r.error)) throw new HttpError(503, "unavailable", { retryAfter: 30 });
  if (r.error || typeof r.data !== "boolean") throw new HttpError(500, "server_error");
  return r.data;
}

/** Throws a 429 with retryAfter (seconds) when over the limit. */
export async function enforceRateLimit(db: Db, key: string, max: number, windowSeconds: number): Promise<void> {
  if (!(await hitRateLimit(db, key, max, windowSeconds))) {
    throw new HttpError(429, "rate_limited", { retryAfter: windowSeconds });
  }
}

/** Standard key for an admin action: one bucket per action and admin. */
export const adminRateKey = (action: string, userId: string) => `admin:${action}:${userId}`;
