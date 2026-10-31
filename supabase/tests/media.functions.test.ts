import nodeAssert from "node:assert/strict";
import { sellerMediaSign } from "../functions/seller-media-sign/handler.ts";
import { sellerMediaFinalize } from "../functions/seller-media-finalize/handler.ts";
import { mediaGc } from "../functions/media-gc/handler.ts";
import { sellerMediaPurge } from "../functions/seller-media-purge/handler.ts";
import { cloudinaryConfigFromEnv, makeCloudinary, type CloudinaryClient } from "../functions/_shared/cloudinary.ts";
import { signParams } from "../functions/_shared/synced/cloudinarySign.js";
import type { Deps } from "../functions/_shared/seller.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);

const BIZ = "10000000-0000-4000-8000-0000000000a1";
const OTHER = "10000000-0000-4000-8000-0000000000b1";
const ITEM = "20000000-0000-4000-8000-0000000000c1";
const FOREIGN_ITEM = "20000000-0000-4000-8000-0000000000c2";
const TOKEN = "token-1";
const SECRET = "test-secret";

type Rpc = (args: any) => { data: any; error: any };
function setup(opts: { cloud?: boolean } = {}) {
  const rpcCalls: { name: string; args: any }[] = [];
  const rpcs: Record<string, Rpc> = {};
  const counters = new Map<string, number>();
  const tables: Record<string, any[]> = {
    items: [{ id: ITEM, business_id: BIZ }, { id: FOREIGN_ITEM, business_id: OTHER }],
    item_media: [],
    businesses: [{ id: BIZ, seller_id: "ES1", phone: "+254712345678", name: "A", status: "live", user_id: "u1" }],
  };
  const query = (t: string) => {
    const eqs: [string, unknown][] = [];
    const api: any = {
      select: () => api, neq: () => api,
      eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
      maybeSingle: () => Promise.resolve({ data: (tables[t] ?? []).find((r) => eqs.every(([c, v]) => r[c] === v)) ?? null, error: null }),
    };
    return api;
  };
  const db = {
    from: query,
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (rpcs[name]) return Promise.resolve(rpcs[name](args));
      if (name === "hit_rate_limit") {
        const n = (counters.get(args.p_key) ?? 0) + 1;
        counters.set(args.p_key, n);
        return Promise.resolve({ data: n <= args.p_max, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    storage: { from: () => ({ createSignedUploadUrl: (path: string) => Promise.resolve({ data: { token: `upload-token-for-${path}`, path }, error: null }) }) },
    auth: { getUser: (t: string) => Promise.resolve(t === TOKEN ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { message: "bad" } }) },
  };
  const destroyed: string[][] = [];
  const cloud: CloudinaryClient = {
    cloudName: "demo",
    signUpload: (publicId) => Promise.resolve({ uploadUrl: "https://api.cloudinary.com/v1_1/demo/image/upload", fields: { public_id: publicId, signature: "sig" } }),
    verifyResponse: ({ signature }) => Promise.resolve(signature === "good-signature-123456"),
    destroy: (ids) => (destroyed.push(ids), Promise.resolve({ deleted: ids.filter((i) => !i.includes("bad")), failed: ids.filter((i) => i.includes("bad")).map((id) => ({ id, reason: "boom" })) })),
  };
  const deps = { db, anon: {}, salt: "s", code: () => "1", sms: () => Promise.resolve(true), email: () => Promise.resolve(true), cronSecret: "cron", cloudinary: opts.cloud === false ? null : cloud } as unknown as Deps;
  return { deps, rpcCalls, rpcs, tables, destroyed };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const authed = (body: unknown) => post(body, { authorization: `Bearer ${TOKEN}` });
const read = async (r: Response) => ({ status: r.status, body: await r.json() });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---- the Cloudinary client -------------------------------------------------------------------------------------------

Deno.test("cloudinary config: CLOUDINARY_URL or the three separate secrets, nothing otherwise", () => {
  const env = (m: Record<string, string>) => (n: string) => m[n];
  assertEquals(cloudinaryConfigFromEnv(env({ CLOUDINARY_URL: "cloudinary://123:abc@demo" })), { cloudName: "demo", apiKey: "123", apiSecret: "abc", aiUpscale: false });
  assertEquals(cloudinaryConfigFromEnv(env({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "1", CLOUDINARY_API_SECRET: "s", CLOUDINARY_AI_UPSCALE: "TRUE" })), { cloudName: "demo", apiKey: "1", apiSecret: "s", aiUpscale: true });
  assertEquals(cloudinaryConfigFromEnv(env({})), null);
  assertEquals(cloudinaryConfigFromEnv(env({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "1" })), null);
});

Deno.test("cloudinary: a signed upload pins the id, formats, transformation and no-overwrite, and the secret never leaves", async () => {
  const c = makeCloudinary({ cloudName: "demo", apiKey: "key-1", apiSecret: SECRET, aiUpscale: false }, fetch, () => 1_700_000_000_000);
  const { uploadUrl, fields } = await c.signUpload(`${BIZ}/${ITEM}/x`);
  assertEquals(uploadUrl, "https://api.cloudinary.com/v1_1/demo/image/upload");
  assertEquals(fields.public_id, `${BIZ}/${ITEM}/x`);
  assertEquals(fields.timestamp, "1700000000");
  assertEquals(fields.allowed_formats, "jpg,png,webp");
  assertEquals(fields.overwrite, "false");
  assertEquals(fields.transformation, "c_fit,w_3840,h_3840/q_auto:best");
  assertEquals(fields.api_key, "key-1");
  const { api_key: _k, signature, ...signed } = fields;
  assertEquals(signature, await signParams(signed, SECRET));
  assert(!JSON.stringify(fields).includes(SECRET));
  const ai = makeCloudinary({ cloudName: "demo", apiKey: "k", apiSecret: SECRET, aiUpscale: true });
  assert((await ai.signUpload("a/b/c")).fields.transformation.startsWith("if_w_lt_960_and_h_lt_960/e_upscale/if_end/c_fit"));
});

Deno.test("cloudinary: destroy treats ok and not-found as deleted, reports the rest, and signs every call", async () => {
  const seen: { url: string; body: URLSearchParams }[] = [];
  const fake = ((url: string, init: RequestInit) => {
    const body = init.body as URLSearchParams;
    seen.push({ url, body });
    const id = body.get("public_id")!;
    const result = id.endsWith("gone") ? { result: "not found" } : id.endsWith("down") ? { error: { message: "rate limited" } } : { result: "ok" };
    return Promise.resolve(new Response(JSON.stringify(result), { status: id.endsWith("down") ? 420 : 200 }));
  }) as unknown as typeof fetch;
  const c = makeCloudinary({ cloudName: "demo", apiKey: "k", apiSecret: SECRET, aiUpscale: false }, fake, () => 1_700_000_000_000);
  const out = await c.destroy(["a/1", "a/gone", "a/down", "a/2", "a/3", "a/4", "a/5"]);
  assertEquals(out.deleted.sort(), ["a/1", "a/2", "a/3", "a/4", "a/5", "a/gone"]);
  assertEquals(out.failed, [{ id: "a/down", reason: "rate limited" }]);
  assertEquals(seen.length, 7);
  assertEquals(seen[0].url, "https://api.cloudinary.com/v1_1/demo/image/destroy");
  for (const s of seen) {
    assertEquals(s.body.get("invalidate"), "true");
    assertEquals(s.body.get("signature"), await signParams({ invalidate: "true", public_id: s.body.get("public_id")!, timestamp: "1700000000" }, SECRET));
  }
  const broken = makeCloudinary({ cloudName: "demo", apiKey: "k", apiSecret: SECRET, aiUpscale: false }, (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch);
  assertEquals((await broken.destroy(["a/1"])).failed, [{ id: "a/1", reason: "offline" }]);
});

// ---- seller-media-sign -----------------------------------------------------------------------------------------------

Deno.test("media-sign: needs a seller, a valid body and Cloudinary configured", async () => {
  const s = setup();
  const h = sellerMediaSign(s.deps);
  assertEquals((await h(post({ purpose: "logo" }))).status, 401);
  assertEquals((await h(authed({ purpose: "avatar" }))).status, 400);
  assertEquals((await h(authed({ purpose: "item_photo" }))).status, 400);
  assertEquals((await h(authed({ purpose: "item_photo", itemId: "nope" }))).status, 400);
  const off = sellerMediaSign(setup({ cloud: false }).deps);
  assertEquals(await read(await off(authed({ purpose: "logo" }))), { status: 503, body: { error: "media_not_configured" } });
});

Deno.test("media-sign: an item photo is signed under the seller's own prefix and recorded first", async () => {
  const s = setup();
  s.rpcs["media_limit_ok"] = () => ({ data: true, error: null });
  const r = await read(await sellerMediaSign(s.deps)(authed({ purpose: "item_photo", itemId: ITEM })));
  assertEquals(r.status, 200);
  const [biz, item, id] = r.body.publicId.split("/");
  assertEquals([biz, item], [BIZ, ITEM]);
  assert(UUID.test(id));
  assertEquals(r.body.fields.public_id, r.body.publicId);
  assertEquals(r.body.expiresIn, 3600);
  const reg = s.rpcCalls.find((c) => c.name === "media_register_upload")!.args;
  assertEquals(reg, { p_business: BIZ, p_item: ITEM, p_purpose: "item_photo", p_public_id: r.body.publicId });
  const names = s.rpcCalls.map((c) => c.name);
  assert(names.indexOf("media_register_upload") < names.length, "registered");
});

Deno.test("media-sign: someone else's item is a 404, a full item is a 409, neither is signed or recorded", async () => {
  const s = setup();
  const h = sellerMediaSign(s.deps);
  assertEquals((await read(await h(authed({ purpose: "item_photo", itemId: FOREIGN_ITEM })))).status, 404);
  s.rpcs["media_limit_ok"] = () => ({ data: false, error: null });
  assertEquals(await read(await h(authed({ purpose: "item_photo", itemId: ITEM }))), { status: 409, body: { error: "limit_reached" } });
  assertEquals(s.rpcCalls.filter((c) => c.name === "media_register_upload").length, 0);
});

Deno.test("media-sign: logo and cover get a profile id; database refusals map to clean errors; rate limited", async () => {
  const s = setup();
  const h = sellerMediaSign(s.deps);
  const logo = await read(await h(authed({ purpose: "logo" })));
  assertEquals(logo.status, 200);
  assert(new RegExp(`^${BIZ}/profile/logo-[0-9a-f-]{36}$`).test(logo.body.publicId));
  assert(new RegExp(`^${BIZ}/profile/cover-[0-9a-f-]{36}$`).test((await read(await h(authed({ purpose: "cover" })))).body.publicId));
  assertEquals(s.rpcCalls.find((c) => c.name === "media_register_upload")!.args.p_item, null);

  s.rpcs["media_register_upload"] = () => ({ data: null, error: { message: "path_not_owned" } });
  assertEquals((await h(authed({ purpose: "logo" }))).status, 403);
  s.rpcs["media_register_upload"] = () => ({ data: null, error: { message: "boom" } });
  assertEquals((await h(authed({ purpose: "logo" }))).status, 500);

  const busy = setup();
  const hb = sellerMediaSign(busy.deps);
  for (let i = 0; i < 120; i += 1) await hb(authed({ purpose: "logo" }));
  assertEquals((await hb(authed({ purpose: "logo" }))).status, 429);
});

// ---- seller-media-finalize (Cloudinary) ------------------------------------------------------------------------------

const PHOTO = `${BIZ}/${ITEM}/30000000-0000-4000-8000-0000000000d1`;
const LOGO = `${BIZ}/profile/logo-30000000-0000-4000-8000-0000000000d2`;
const hosted = (extra: Record<string, unknown> = {}) => ({ version: 1700000001, signature: "good-signature-123456", width: 3840, height: 2160, bytes: 910_000, format: "webp", ...extra });

Deno.test("media-finalize (hosted): a photo is attached with the facts Cloudinary reported, once its signature checks out", async () => {
  const s = setup();
  s.rpcs["media_confirm_upload"] = () => ({ data: { purpose: "item_photo", item_id: ITEM }, error: null });
  s.rpcs["attach_item_media"] = () => ({ data: "media-1", error: null });
  const r = await read(await sellerMediaFinalize(s.deps)(authed({ itemId: ITEM, path: PHOTO, cloudinary: hosted() })));
  assertEquals(r, { status: 201, body: { id: "media-1", kind: "image", width: 3840, height: 2160, durationSec: null, size: 910_000 } });
  const a = s.rpcCalls.find((c) => c.name === "attach_item_media")!.args;
  assertEquals([a.p_kind, a.p_mime, a.p_path, a.p_item, a.p_width, a.p_height, a.p_size], ["image", "image/webp", PHOTO, ITEM, 3840, 2160, 910_000]);
  assertEquals(s.rpcCalls.find((c) => c.name === "media_confirm_upload")!.args, { p_business: BIZ, p_public_id: PHOTO });
});

Deno.test("media-finalize (hosted): forged, foreign or unissued ids are refused before anything is attached", async () => {
  const s = setup();
  const h = sellerMediaFinalize(s.deps);
  assertEquals((await h(post({ itemId: ITEM, path: PHOTO, cloudinary: hosted() }))).status, 401);
  assertEquals((await read(await h(authed({ itemId: ITEM, path: PHOTO })))).status, 400, "no Cloudinary facts");
  assertEquals((await read(await h(authed({ itemId: ITEM, path: PHOTO, cloudinary: hosted({ signature: "forged-signature-000000" }) })))).status, 403);
  assertEquals((await read(await h(authed({ itemId: ITEM, path: `${OTHER}/${ITEM}/x`, cloudinary: hosted() })))).status, 403, "another business's prefix");
  assertEquals((await read(await h(authed({ itemId: ITEM, path: `${BIZ}/../${OTHER}/x`, cloudinary: hosted() })))).status, 403);
  assertEquals((await read(await h(authed({ itemId: ITEM, path: PHOTO, cloudinary: hosted({ format: "gif" }) })))).status, 400);
  assertEquals((await read(await h(authed({ itemId: ITEM, path: PHOTO, cloudinary: hosted({ width: 0 }) })))).status, 400);
  assertEquals(s.rpcCalls.filter((c) => c.name === "attach_item_media").length, 0);
  s.rpcs["media_confirm_upload"] = () => ({ data: null, error: { message: "upload_not_found" } });
  assertEquals(await read(await h(authed({ itemId: ITEM, path: PHOTO, cloudinary: hosted() }))), { status: 404, body: { error: "upload_not_found" } });
  assertEquals(s.rpcCalls.filter((c) => c.name === "attach_item_media").length, 0);
  assertEquals((await sellerMediaFinalize(setup({ cloud: false }).deps)(authed({ itemId: ITEM, path: PHOTO, cloudinary: hosted() }))).status, 503);
});

Deno.test("media-finalize (hosted): the item must be the one the id was issued for; duplicates and limits are clean 409s", async () => {
  const s = setup();
  const h = sellerMediaFinalize(s.deps);
  s.rpcs["media_confirm_upload"] = () => ({ data: { purpose: "item_photo", item_id: ITEM }, error: null });
  assertEquals((await read(await h(authed({ itemId: FOREIGN_ITEM, path: PHOTO, cloudinary: hosted() })))).status, 400);
  assertEquals((await read(await h(authed({ path: PHOTO, cloudinary: hosted() })))).status, 400);

  s.tables.item_media.push({ id: "m", path: PHOTO });
  assertEquals((await read(await h(authed({ itemId: ITEM, path: PHOTO, cloudinary: hosted() })))).status, 409);
  s.tables.item_media.length = 0;

  s.rpcs["attach_item_media"] = () => ({ data: null, error: { message: "limit_reached:item_media" } });
  assertEquals(await read(await h(authed({ itemId: ITEM, path: PHOTO, cloudinary: hosted() }))), { status: 409, body: { error: "limit_reached" } });
  const queued = s.rpcCalls.find((c) => c.name === "media_gc_enqueue")!.args;
  assertEquals(queued, { p_ids: [PHOTO], p_reason: "limit_reached" });

  s.rpcs["attach_item_media"] = () => ({ data: null, error: { message: "boom" } });
  assertEquals((await read(await h(authed({ itemId: ITEM, path: PHOTO, cloudinary: hosted() })))).status, 500);
});

Deno.test("media-finalize (hosted): a logo is confirmed but never attached to an item", async () => {
  const s = setup();
  s.rpcs["media_confirm_upload"] = () => ({ data: { purpose: "logo", item_id: null }, error: null });
  const r = await read(await sellerMediaFinalize(s.deps)(authed({ path: LOGO, cloudinary: hosted({ width: 800, height: 800, bytes: 40_000, format: "png" }) })));
  assertEquals(r, { status: 200, body: { path: LOGO, kind: "logo", width: 800, height: 800, size: 40_000 } });
  assertEquals(s.rpcCalls.filter((c) => c.name === "attach_item_media").length, 0);
});

Deno.test("media-sign: gallery and team photos get their own folder; a full gallery is a 409 before any upload", async () => {
  const s = setup();
  const h = sellerMediaSign(s.deps);
  s.rpcs["gallery_room"] = () => ({ data: true, error: null });
  const g = await read(await h(authed({ purpose: "gallery" })));
  assertEquals(g.status, 200);
  assert(new RegExp(`^${BIZ}/gallery/[0-9a-f-]{36}$`).test(g.body.publicId));
  assert(new RegExp(`^${BIZ}/staff/[0-9a-f-]{36}$`).test((await read(await h(authed({ purpose: "staff" })))).body.publicId));
  s.rpcs["gallery_room"] = () => ({ data: false, error: null });
  const before = s.rpcCalls.filter((c) => c.name === "media_register_upload").length;
  assertEquals(await read(await h(authed({ purpose: "gallery" }))), { status: 409, body: { error: "limit_reached" } });
  assertEquals(s.rpcCalls.filter((c) => c.name === "media_register_upload").length, before);
});

Deno.test("media-finalize (hosted): a gallery photo is attached with caption and pair; limit and category refusals are clean and queue the file", async () => {
  const GAL = `${BIZ}/gallery/11111111-1111-4111-8111-111111111111`;
  const PAIR = "30000000-0000-4000-8000-000000000001";
  const s = setup();
  s.rpcs["media_confirm_upload"] = () => ({ data: { purpose: "gallery", item_id: null }, error: null });
  s.rpcs["attach_gallery_photo"] = () => ({ data: "g-1", error: null });
  const h = sellerMediaFinalize(s.deps);
  const r = await read(await h(authed({ path: GAL, caption: "Fresh", pairId: PAIR, pairRole: "before", cloudinary: hosted() })));
  assertEquals(r, { status: 201, body: { id: "g-1", kind: "gallery", width: 3840, height: 2160, size: 910_000 } });
  const a = s.rpcCalls.find((c) => c.name === "attach_gallery_photo")!.args;
  assertEquals([a.p_business, a.p_path, a.p_caption, a.p_pair_id, a.p_pair_role], [BIZ, GAL, "Fresh", PAIR, "before"]);
  assertEquals((await h(authed({ path: GAL, pairId: PAIR, cloudinary: hosted() }))).status, 400);

  s.rpcs["attach_gallery_photo"] = () => ({ data: null, error: { message: "limit_reached:gallery_photos" } });
  assertEquals((await read(await h(authed({ path: GAL, cloudinary: hosted() })))).body, { error: "limit_reached" });
  s.rpcs["attach_gallery_photo"] = () => ({ data: null, error: { message: "pair_category" } });
  assertEquals((await h(authed({ path: GAL, cloudinary: hosted() }))).status, 422);
  assertEquals(s.rpcCalls.filter((c) => c.name === "media_gc_enqueue").length, 2);
});

Deno.test("media-finalize (hosted): a team photo is confirmed but never attached by the function", async () => {
  const STAFF = `${BIZ}/staff/22222222-2222-4222-8222-222222222222`;
  const s = setup();
  s.rpcs["media_confirm_upload"] = () => ({ data: { purpose: "staff", item_id: null }, error: null });
  const r = await read(await sellerMediaFinalize(s.deps)(authed({ path: STAFF, cloudinary: hosted({ width: 640, height: 640, bytes: 30_000, format: "jpg" }) })));
  assertEquals(r, { status: 200, body: { path: STAFF, kind: "staff", width: 640, height: 640, size: 30_000 } });
});

// ---- media-gc ---------------------------------------------------------------------------------------------------------

Deno.test("media-gc: only the cron secret may run it, and it needs Cloudinary", async () => {
  const s = setup();
  const h = mediaGc(s.deps);
  assertEquals((await h(post({}))).status, 401);
  assertEquals((await h(post({}, { "x-cron-secret": "nope" }))).status, 401);
  assertEquals((await mediaGc(setup({ cloud: false }).deps)(post({}, { "x-cron-secret": "cron" }))).status, 503);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("media-gc: sweeps, deletes what is due, confirms the deleted and backs off the failed", async () => {
  const s = setup();
  s.rpcs["media_sweep_orphans"] = () => ({ data: 2, error: null });
  s.rpcs["media_gc_claim"] = () => ({ data: [{ public_id: "a/1" }, { public_id: "a/bad" }, { public_id: "a/2" }], error: null });
  const r = await read(await mediaGc(s.deps)(post({}, { "x-cron-secret": "cron" })));
  assertEquals(r, { status: 200, body: { swept: 2, deleted: 2, failed: 1 } });
  assertEquals(s.destroyed, [["a/1", "a/bad", "a/2"]]);
  assertEquals(s.rpcCalls.find((c) => c.name === "media_gc_done")!.args, { p_ids: ["a/1", "a/2"] });
  assertEquals(s.rpcCalls.find((c) => c.name === "media_gc_fail")!.args, { p_ids: ["a/bad"], p_error: "boom" });
  assertEquals(s.rpcCalls.map((c) => c.name).slice(0, 2), ["media_sweep_orphans", "media_gc_claim"]);
});

Deno.test("media-gc: an empty queue is a quick no-op, and a database error is a 500", async () => {
  const s = setup();
  s.rpcs["media_gc_claim"] = () => ({ data: [], error: null });
  assertEquals((await read(await mediaGc(s.deps)(post({}, { "x-cron-secret": "cron" })))).body, { swept: 0, deleted: 0, failed: 0 });
  assertEquals(s.destroyed, []);
  s.rpcs["media_gc_claim"] = () => ({ data: null, error: { message: "down" } });
  assertEquals((await mediaGc(s.deps)(post({}, { "x-cron-secret": "cron" }))).status, 500);
});

// ---- seller-media-purge -----------------------------------------------------------------------------------------------

Deno.test("media-purge: a seller deletes their own queued files right away, and only their own", async () => {
  const s = setup();
  s.rpcs["media_gc_claim_for_business"] = () => ({ data: [{ public_id: `${BIZ}/a` }, { public_id: `${BIZ}/bad` }], error: null });
  const h = sellerMediaPurge(s.deps);
  assertEquals((await h(post({}))).status, 401);
  const r = await read(await h(authed({})));
  assertEquals(r, { status: 200, body: { deleted: 1, failed: 1 } });
  assertEquals(s.rpcCalls.find((c) => c.name === "media_gc_claim_for_business")!.args, { p_business: BIZ, p_limit: 20 });
  assertEquals(s.destroyed, [[`${BIZ}/a`, `${BIZ}/bad`]]);
  assertEquals(s.rpcCalls.find((c) => c.name === "media_gc_done")!.args, { p_ids: [`${BIZ}/a`] });
  assertEquals(s.rpcCalls.find((c) => c.name === "media_gc_fail")!.args, { p_ids: [`${BIZ}/bad`], p_error: "boom" });
});

Deno.test("media-purge: nothing queued is a quick no-op; no Cloudinary or a database error are clean failures", async () => {
  const s = setup();
  s.rpcs["media_gc_claim_for_business"] = () => ({ data: [], error: null });
  assertEquals((await read(await sellerMediaPurge(s.deps)(authed({})))).body, { deleted: 0, failed: 0 });
  assertEquals(s.destroyed, []);
  assertEquals((await sellerMediaPurge(setup({ cloud: false }).deps)(authed({}))).status, 503);
  s.rpcs["media_gc_claim_for_business"] = () => ({ data: null, error: { message: "down" } });
  assertEquals((await sellerMediaPurge(s.deps)(authed({}))).status, 500);
});

// ---- item videos -----------------------------------------------------------------------------------------------------

Deno.test("media-sign: an item video gets an upload ticket under the seller's own prefix, with no Cloudinary involved", async () => {
  const s = setup({ cloud: false });
  s.rpcs["media_limit_ok"] = () => ({ data: true, error: null });
  const r = await read(await sellerMediaSign(s.deps)(authed({ purpose: "item_video", itemId: ITEM, type: "mp4" })));
  assertEquals(r.status, 200);
  assert(r.body.path.startsWith(`${BIZ}/${ITEM}/`) && r.body.path.endsWith(".mp4"));
  assert(UUID.test(r.body.path.slice(`${BIZ}/${ITEM}/`.length, -4)));
  assertEquals(r.body.token, `upload-token-for-${r.body.path}`);
  assertEquals(r.body.kind, "video");
  const asked = s.rpcCalls.find((c) => c.name === "media_limit_ok")!;
  assertEquals(asked.args, { p_item: ITEM, p_kind: "video" });
});

Deno.test("media-sign: a video is refused for another shop's item, at the plan limit, and for formats other than mp4 or webm", async () => {
  const s = setup();
  const h = sellerMediaSign(s.deps);
  s.rpcs["media_limit_ok"] = () => ({ data: true, error: null });
  assertEquals((await h(authed({ purpose: "item_video", itemId: FOREIGN_ITEM, type: "mp4" }))).status, 404);
  assertEquals((await h(authed({ purpose: "item_video", itemId: ITEM, type: "mov" }))).status, 400);
  assertEquals((await h(authed({ purpose: "item_video", itemId: ITEM }))).status, 400);
  s.rpcs["media_limit_ok"] = () => ({ data: false, error: null });
  assertEquals(await read(await h(authed({ purpose: "item_video", itemId: ITEM, type: "webm" }))), { status: 409, body: { error: "limit_reached" } });
});
