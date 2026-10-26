const env = (name) => (typeof process !== "undefined" ? process.env?.[name] : undefined);

const baseUrl = () => String(env("UPSTASH_REDIS_REST_URL") || "").replace(/\/$/, "");
const token = () => env("UPSTASH_REDIS_REST_TOKEN") || "";
const SKEW_MS = 5000;

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

const through = async (transform, bytes) => {
  const writer = transform.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  return new Uint8Array(await new Response(transform.readable).arrayBuffer());
};

const toBase64 = (bytes) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export const pack = async (value) => toBase64(await through(new CompressionStream("gzip"), new TextEncoder().encode(JSON.stringify(value))));

export const unpack = async (text) => JSON.parse(new TextDecoder().decode(await through(new DecompressionStream("gzip"), fromBase64(text))));

export async function cached(key, { freshMs, staleMs }, load) {
  const on = redisConfigured();
  let kept = null;
  if (on) {
    try {
      const raw = await command(["GET", key], 2000);
      if (raw) kept = await unpack(raw);
    } catch (error) {
      console.warn(`[redis] read failed (${error?.message ?? error})`);
    }
  }
  const age = (entry) => Date.now() - entry.at;
  if (kept && age(kept) > -SKEW_MS && age(kept) < freshMs) return kept;
  let fresh;
  try {
    fresh = { at: Date.now(), data: await load() };
  } catch (error) {
    if (kept && age(kept) < staleMs) {
      console.warn(`[redis] load failed, serving the shared copy from ${Math.round(age(kept) / 1000)} s ago`);
      return kept;
    }
    throw error;
  }
  if (on) {
    try {
      await command(["SET", key, await pack(fresh), "EX", String(Math.ceil(staleMs / 1000))], 5000);
    } catch (error) {
      console.warn(`[redis] write failed (${error?.message ?? error})`);
    }
  }
  return fresh;
}
