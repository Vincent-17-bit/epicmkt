const env = (name) => (typeof process !== "undefined" ? process.env?.[name] : undefined);

const baseUrl = () => String(env("UPSTASH_REDIS_REST_URL") || "").replace(/\/$/, "");
const token = () => env("UPSTASH_REDIS_REST_TOKEN") || "";

export const redisConfigured = () => Boolean(baseUrl() && token());

async function command(args, timeoutMs) {
  const res = await fetch(baseUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`redis_${res.status}`);
  return (await res.json()).result;
}

export async function cached(key, ttlSeconds, load) {
  const on = redisConfigured();
  if (on) {
    try {
      const hit = await command(["GET", key], 1500);
      if (hit) return JSON.parse(hit);
    } catch (error) {
      console.warn(`[redis] read failed (${error?.message ?? error})`);
    }
  }
  const fresh = await load();
  if (on) {
    try {
      await command(["SET", key, JSON.stringify(fresh), "EX", String(ttlSeconds)], 5000);
    } catch (error) {
      console.warn(`[redis] write failed (${error?.message ?? error})`);
    }
  }
  return fresh;
}
