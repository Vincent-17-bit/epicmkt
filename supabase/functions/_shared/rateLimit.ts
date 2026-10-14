import type { Db } from "./seller.ts";

export async function rateLimit(db: Db, key: string, max: number, seconds: number): Promise<boolean> {
  const r = await db.rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: seconds });
  return r.data === true;
}
