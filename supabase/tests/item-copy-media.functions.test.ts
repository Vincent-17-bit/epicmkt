import nodeAssert from "node:assert/strict";
import { sellerItemCopyMedia } from "../functions/seller-item-copy-media/handler.ts";
import { cloudinaryConfigFromEnv, makeCloudinary, type CloudinaryClient } from "../functions/_shared/cloudinary.ts";
import { signParams } from "../functions/_shared/synced/cloudinarySign.js";
import type { Deps } from "../functions/_shared/seller.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);

const BIZ = "10000000-0000-4000-8000-0000000000a1";
const OTHER = "10000000-0000-4000-8000-0000000000b1";
const FROM = "20000000-0000-4000-8000-0000000000c1";
const TO = "20000000-0000-4000-8000-0000000000c2";
const FOREIGN = "20000000-0000-4000-8000-0000000000c3";
const TOKEN = "token-1";

const img = (n: number, sort: number) => ({ item_id: FROM, business_id: BIZ, kind: "image", path: `${BIZ}/${FROM}/img-${n}`, mime: "image/webp", width: 800, height: 600, duration_sec: null, size_bytes: 1000 + n, sort });
const vid = (n: number, sort: number) => ({ item_id: FROM, business_id: BIZ, kind: "video", path: `${BIZ}/${FROM}/vid-${n}.mp4`, mime: "video/mp4", width: 640, height: 360, duration_sec: 12, size_bytes: 5000, sort });

function setup(opts: { cloud?: boolean; media?: any[]; failCopy?: (id: string) => boolean; failStorage?: boolean; attachError?: string; status?: string } = {}) {
  const rpcCalls: { name: string; args: any }[] = [];
  const counters = new Map<string, number>();
  const tables: Record<string, any[]> = {
    items: [{ id: FROM, business_id: BIZ }, { id: TO, business_id: BIZ }, { id: FOREIGN, business_id: OTHER }],
    item_media: opts.media ?? [img(1, 0), vid(1, 1), img(2, 2)],
    businesses: [{ id: BIZ, seller_id: "ES1", phone: "+254712345678", name: "A", status: opts.status ?? "live", user_id: "u1" }],
  };
  const attached: any[] = [];
  const query = (t: string) => {
    const eqs: [string, unknown][] = [];
    let max = Infinity;
    const rows = () => (tables[t] ?? []).filter((r) => eqs.every(([c, v]) => r[c] === v)).slice(0, max).map((r) => ({ ...r }));
    const api: any = {
      select: () => api, neq: () => api, order: () => api,
      limit: (n: number) => ((max = n), api),
      eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (ok: any, bad: any) => Promise.resolve({ data: rows().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), error: null }).then(ok, bad),
    };
    return api;
  };
  const storageCopies: [string, string][] = [];
  const db = {
    from: query,
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === "hit_rate_limit") {
        const n = (counters.get(args.p_key) ?? 0) + 1;
        counters.set(args.p_key, n);
        return Promise.resolve({ data: n <= args.p_max, error: null });
      }
      if (name === "attach_item_media") {
        if (opts.attachError) return Promise.resolve({ data: null, error: { message: opts.attachError } });
        attached.push(args);
        return Promise.resolve({ data: `row-${attached.length}`, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    storage: { from: () => ({ copy: (a: string, b: string) => (storageCopies.push([a, b]), Promise.resolve({ data: null, error: opts.failStorage ? { message: "nope" } : null })) }) },
    auth: { getUser: (t: string) => Promise.resolve(t === TOKEN ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { message: "bad" } }) },
  };
  const copies: [string, string][] = [];
  const cloud = {
    cloudName: "demo",
    signUpload: () => Promise.resolve({ uploadUrl: "", fields: {} }),
    verifyResponse: () => Promise.resolve(true),
    destroy: (ids: string[]) => Promise.resolve({ deleted: ids, failed: [] }),
    copy: (from: string, to: string) => (copies.push([from, to]), Promise.resolve(!(opts.failCopy?.(from) ?? false))),
  } as unknown as CloudinaryClient;
  const deps = { db, anon: {}, salt: "s", code: () => "1", sms: () => Promise.resolve(true), email: () => Promise.resolve(true), cronSecret: "cron", cloudinary: opts.cloud === false ? null : cloud } as unknown as Deps;
  return { deps, rpcCalls, attached, copies, storageCopies };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const authed = (body: unknown) => post(body, { authorization: `Bearer ${TOKEN}` });
const read = async (r: Response) => ({ status: r.status, body: await r.json() });
const run = (s: ReturnType<typeof setup>, body: unknown) => sellerItemCopyMedia(s.deps)(authed(body)).then(read);

Deno.test("copy-media: every file is copied to a new id under the new item, in the original order", async () => {
  const s = setup();
  const out = await run(s, { fromItemId: FROM, toItemId: TO });
  assertEquals(out, { status: 200, body: { copied: 3, failed: [], total: 3 } });
  assertEquals(s.attached.map((a) => a.p_kind), ["image", "video", "image"]);
  for (const a of s.attached) {
    assert(a.p_path.startsWith(`${BIZ}/${TO}/`), a.p_path);
    assert(!a.p_path.includes(FROM));
  }
  assert(s.attached[1].p_path.endsWith(".mp4"));
  assertEquals(new Set(s.attached.map((a) => a.p_path)).size, 3);
  assertEquals(s.copies.map(([from]) => from), [`${BIZ}/${FROM}/img-1`, `${BIZ}/${FROM}/img-2`]);
  assertEquals(s.storageCopies.map(([from]) => from), [`${BIZ}/${FROM}/vid-1.mp4`]);
  assertEquals(s.attached[0], { p_item: TO, p_kind: "image", p_path: s.attached[0].p_path, p_mime: "image/webp", p_width: 800, p_height: 600, p_duration: null, p_size: 1001 });
  assertEquals(s.attached[1].p_duration, 12);
  const names = s.rpcCalls.map((c) => c.name);
  assertEquals(names.filter((n) => n === "media_register_upload").length, 3);
  assertEquals(names.filter((n) => n === "media_confirm_upload").length, 3);
});

Deno.test("copy-media: a picture that fails to copy is reported and queued for deletion, the rest still copy", async () => {
  const s = setup({ failCopy: (id) => id.endsWith("img-1") });
  const out = await run(s, { fromItemId: FROM, toItemId: TO });
  assertEquals(out.status, 200);
  assertEquals(out.body.copied, 2);
  assertEquals(out.body.failed, [{ path: `${BIZ}/${FROM}/img-1`, reason: "copy_failed" }]);
  const gc = s.rpcCalls.filter((c) => c.name === "media_gc_enqueue");
  assertEquals(gc.length, 1);
  assertEquals(gc[0].args.p_reason, "copy_failed");
  assertEquals(s.attached.length, 2);
});

Deno.test("copy-media: a video that fails to copy is reported", async () => {
  const s = setup({ failStorage: true });
  const out = await run(s, { fromItemId: FROM, toItemId: TO });
  assertEquals(out.body.copied, 2);
  assertEquals(out.body.failed.map((f: any) => f.reason), ["copy_failed"]);
});

Deno.test("copy-media: without Cloudinary the videos still copy and the pictures are reported", async () => {
  const s = setup({ cloud: false });
  const out = await run(s, { fromItemId: FROM, toItemId: TO });
  assertEquals(out.body.copied, 1);
  assertEquals(out.body.failed.map((f: any) => f.reason), ["media_not_configured", "media_not_configured"]);
});

Deno.test("copy-media: the plan's media limit is reported per file and the file is queued for deletion", async () => {
  const s = setup({ attachError: "limit_reached:item_media" });
  const out = await run(s, { fromItemId: FROM, toItemId: TO });
  assertEquals(out.body.copied, 0);
  assertEquals(out.body.failed.map((f: any) => f.reason), ["limit_reached", "limit_reached", "limit_reached"]);
  assertEquals(s.rpcCalls.filter((c) => c.name === "media_gc_enqueue").length, 3);
});

Deno.test("copy-media: refuses another shop's item, the same item, an item that already has media, a suspended shop and bad input", async () => {
  assertEquals((await run(setup(), { fromItemId: FOREIGN, toItemId: TO })).body, { error: "item_not_found" });
  assertEquals((await run(setup(), { fromItemId: FROM, toItemId: FOREIGN })).body, { error: "item_not_found" });
  assertEquals((await run(setup(), { fromItemId: FROM, toItemId: FROM })).status, 400);
  assertEquals((await run(setup(), { fromItemId: "nope", toItemId: TO })).status, 400);
  const full = setup({ media: [img(1, 0), { ...img(9, 1), item_id: TO }] });
  const out = await run(full, { fromItemId: FROM, toItemId: TO });
  assertEquals(out, { status: 409, body: { error: "target_not_empty" } });
  assertEquals(full.attached.length, 0);
  assertEquals((await run(setup({ status: "suspended" }), { fromItemId: FROM, toItemId: TO })).status, 403);
  assertEquals((await sellerItemCopyMedia(setup().deps)(post({ fromItemId: FROM, toItemId: TO }))).status, 401);
});

Deno.test("copy-media: an item with no media copies nothing", async () => {
  const out = await run(setup({ media: [] }), { fromItemId: FROM, toItemId: TO });
  assertEquals(out, { status: 200, body: { copied: 0, failed: [], total: 0 } });
});

Deno.test("cloudinary copy: a signed upload from our own delivery URL, no overwrite, no transformation, and failures resolve false", async () => {
  const seen: { url: string; body: URLSearchParams }[] = [];
  const ok = ((url: string, init: RequestInit) => {
    const body = init.body as URLSearchParams;
    seen.push({ url, body });
    return Promise.resolve(new Response(JSON.stringify({ public_id: body.get("public_id") }), { status: 200 }));
  }) as unknown as typeof fetch;
  const c = makeCloudinary({ cloudName: "demo", apiKey: "key-1", apiSecret: "test-secret", aiUpscale: true }, ok, () => 1_700_000_000_000);
  assertEquals(await c.copy("a/b/src", "a/c/dst"), true);
  assertEquals(seen[0].url, "https://api.cloudinary.com/v1_1/demo/image/upload");
  assertEquals(seen[0].body.get("file"), "https://res.cloudinary.com/demo/image/upload/a/b/src");
  assertEquals(seen[0].body.get("overwrite"), "false");
  assertEquals(seen[0].body.get("transformation"), null);
  assertEquals(seen[0].body.get("signature"), await signParams({ overwrite: "false", public_id: "a/c/dst", timestamp: "1700000000" }, "test-secret"));
  assert(!JSON.stringify([...seen[0].body.entries()]).includes("test-secret"));
  const refused = makeCloudinary({ cloudName: "demo", apiKey: "k", apiSecret: "s", aiUpscale: false }, (() => Promise.resolve(new Response("{}", { status: 400 }))) as unknown as typeof fetch);
  assertEquals(await refused.copy("a", "b"), false);
  const down = makeCloudinary({ cloudName: "demo", apiKey: "k", apiSecret: "s", aiUpscale: false }, (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch);
  assertEquals(await down.copy("a", "b"), false);
  assert(cloudinaryConfigFromEnv(() => undefined) === null);
});

const withIds = () => [{ ...img(1, 0), id: "m-1" }, { ...vid(1, 1), id: "m-2" }, { ...img(2, 2), id: "m-3" }];

Deno.test("copy-media: variants and option values are re-pointed at the copies (old media id -> new media id)", async () => {
  const s = setup({ media: withIds() });
  const out = await run(s, { fromItemId: FROM, toItemId: TO });
  assertEquals(out, { status: 200, body: { copied: 3, failed: [], total: 3 } });
  const remap = s.rpcCalls.filter((c) => c.name === "item_remap_copied_media");
  assertEquals(remap.length, 1);
  assertEquals(remap[0].args, { p_item: TO, p_map: { "m-1": "row-1", "m-2": "row-2", "m-3": "row-3" } });
});

Deno.test("copy-media: a file that did not copy is left out of the map, so its variants drop the reference", async () => {
  const s = setup({ media: withIds(), failCopy: (id) => id.endsWith("img-1") });
  const out = await run(s, { fromItemId: FROM, toItemId: TO });
  assertEquals(out.body.copied, 2);
  const remap = s.rpcCalls.filter((c) => c.name === "item_remap_copied_media");
  assertEquals(remap[0].args.p_map, { "m-2": "row-1", "m-3": "row-2" });
});

Deno.test("copy-media: the remap runs even when nothing copied, and its failure never fails the copy", async () => {
  const none = setup({ media: [], cloud: false });
  assertEquals((await run(none, { fromItemId: FROM, toItemId: TO })).status, 200);
  assertEquals(none.rpcCalls.filter((c) => c.name === "item_remap_copied_media")[0].args, { p_item: TO, p_map: {} });

  const s = setup({ media: withIds() });
  const original = s.deps.db.rpc;
  (s.deps.db as any).rpc = (name: string, args: any) => (name === "item_remap_copied_media" ? Promise.resolve({ data: null, error: { message: "boom" } }) : original(name, args));
  const out = await run(s, { fromItemId: FROM, toItemId: TO });
  assertEquals(out, { status: 200, body: { copied: 3, failed: [], total: 3 } });
});

Deno.test("copy-media: nothing is remapped when the request is refused", async () => {
  const s = setup({ media: withIds() });
  await run(s, { fromItemId: FROM, toItemId: FOREIGN });
  assertEquals(s.rpcCalls.filter((c) => c.name === "item_remap_copied_media").length, 0);
});
