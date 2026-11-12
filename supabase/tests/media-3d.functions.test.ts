import nodeAssert from "node:assert/strict";
import { sellerMediaTicket } from "../functions/seller-media-ticket/handler.ts";
import { sellerMedia3dFinalize } from "../functions/seller-media3d-finalize/handler.ts";
import { sellerItemCopyMedia } from "../functions/seller-item-copy-media/handler.ts";
import { settleDeletes } from "../functions/_shared/mediaGc.ts";
import type { Deps } from "../functions/_shared/seller.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);

// A17 pipeline, one test per hop: ticket (limits, types) -> bytes -> finalize (real checks, role from the ticket) -> cleanup.

const BIZ = "10000000-0000-4000-8000-0000000000a1";
const OTHER = "10000000-0000-4000-8000-0000000000b1";
const ITEM = "20000000-0000-4000-8000-0000000000c1";
const FOREIGN_ITEM = "20000000-0000-4000-8000-0000000000c2";
const TOKEN = "token-1";
const MB = 1024 * 1024;
const uuid = () => crypto.randomUUID();

const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
// A real minimal glTF 2 binary (header + one JSON chunk).
function glb(doc: unknown = { asset: { version: "2.0" } }, o: { version?: number; lengthDelta?: number } = {}) {
  const json = [...new TextEncoder().encode(JSON.stringify(doc))];
  while (json.length % 4) json.push(0x20);
  return Uint8Array.from([0x67, 0x6c, 0x54, 0x46, ...le32(o.version ?? 2), ...le32(20 + json.length + (o.lengthDelta ?? 0)), ...le32(json.length), 0x4a, 0x53, 0x4f, 0x4e, ...json]);
}
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(60).fill(0)]);

type Opts = { cloud?: boolean; suspended?: boolean; attachError?: string; verify?: boolean; values?: string[]; media?: { kind: string; option_ids: string[] | null }[]; limit?: number };

function setup(opts: Opts = {}) {
  const uploads = new Map<string, { business_id: string; item_id: string | null; purpose: string }>();
  const attached: any[] = [];
  const queued: { ids: string[]; reason: string }[] = [];
  const objects = new Map<string, Uint8Array | Blob>();
  const removed: string[] = [];
  const registered: any[] = [];
  const counters = new Map<string, number>();
  const media = (opts.media ?? []).map((m) => ({ ...m, item_id: ITEM }));
  const items = [{ id: ITEM, business_id: BIZ }, { id: FOREIGN_ITEM, business_id: OTHER }];
  const query = (t: string) => {
    const eqs: [string, unknown][] = []; const ins: [string, unknown[]][] = [];
    const rows = () => (t === "items" ? items : t === "item_media" ? [...attached.map((a) => ({ path: a.p_path, id: "x" })), ...media] : t === "media_uploads" ? [...uploads].map(([public_id, u]) => ({ public_id, ...u })) : t === "businesses" ? [{ id: BIZ, seller_id: "ES1", phone: "+254712345678", name: "A", status: opts.suspended ? "suspended" : "live", user_id: "u1" }] : []) as any[];
    const match = () => rows().filter((r) => eqs.every(([c, v]) => r[c] === v) && ins.every(([c, vs]) => vs.includes(r[c])));
    const api: any = { select: () => api, neq: () => api, limit: () => api, eq: (c: string, v: unknown) => (eqs.push([c, v]), api), in: (c: string, vs: unknown[]) => (ins.push([c, vs]), api),
      maybeSingle: () => Promise.resolve({ data: match()[0] ?? null, error: null }), then: (res: any, rej: any) => Promise.resolve({ data: match(), error: null }).then(res, rej) };
    return api;
  };
  const rpc = (name: string, a: any) => {
    if (name === "hit_rate_limit") { const n = (counters.get(a.p_key) ?? 0) + 1; counters.set(a.p_key, n); return Promise.resolve({ data: n <= a.p_max, error: null }); }
    if (name === "item_has_option_value") return Promise.resolve({ data: (opts.values ?? ["grey", "black"]).includes(a.p_id), error: null });
    if (name === "media_limit_ok") return Promise.resolve({ data: true, error: null });
    if (name === "media_register_upload") { registered.push(a); uploads.set(a.p_public_id, { business_id: a.p_business, item_id: a.p_item, purpose: a.p_purpose }); return Promise.resolve({ data: null, error: null }); }
    if (name === "media_confirm_upload") { const u = uploads.get(a.p_public_id); if (!u || u.business_id !== a.p_business) return Promise.resolve({ data: null, error: { message: "upload_not_found" } }); uploads.delete(a.p_public_id); return Promise.resolve({ data: { purpose: u.purpose, item_id: u.item_id }, error: null }); }
    if (name === "attach_item_media3d") { if (opts.attachError) return Promise.resolve({ data: null, error: { message: opts.attachError } }); attached.push(a); return Promise.resolve({ data: uuid(), error: null }); }
    if (name === "media_gc_enqueue") { queued.push({ ids: a.p_ids, reason: a.p_reason }); return Promise.resolve({ data: a.p_ids.length, error: null }); }
    return Promise.resolve({ data: null, error: null });
  };
  const storage = { from: () => ({
    createSignedUploadUrl: (path: string) => Promise.resolve({ data: { token: `upload-token-for-${path}`, path }, error: null }),
    download: (path: string) => Promise.resolve(objects.has(path) ? { data: objects.get(path) instanceof Uint8Array ? new Blob([objects.get(path) as Uint8Array]) : objects.get(path), error: null } : { data: null, error: { message: "Object not found" } }),
    remove: (paths: string[]) => { removed.push(...paths); paths.forEach((p) => objects.delete(p)); return Promise.resolve({ data: null, error: null }); },
  }) };
  const db = { from: query, rpc, storage, auth: { getUser: (t: string) => Promise.resolve(t === TOKEN ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { message: "bad" } }) } };
  const deps = { db, anon: {}, salt: "s", code: () => "1", sms: () => Promise.resolve(true), email: () => Promise.resolve(true), cronSecret: "cron",
    cloudinary: opts.cloud === false ? null : { cloudName: "demo", signUpload: (id: string) => Promise.resolve({ uploadUrl: `https://up/${id}`, fields: { signature: "s" } }), verifyResponse: () => Promise.resolve(opts.verify !== false), destroy: (ids: string[]) => Promise.resolve({ deleted: ids, failed: [] }), copy: () => Promise.resolve(true) } } as unknown as Deps;
  return { deps, uploads, attached, queued, objects, removed, registered, db };
}

const post = (body: unknown, headers: Record<string, string> = {}) => new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const authed = (body: unknown) => post(body, { authorization: `Bearer ${TOKEN}` });
const read = async (r: Response) => ({ status: r.status, body: await r.json() });
const ticket = (t: ReturnType<typeof setup>, body: Record<string, unknown>) => sellerMediaTicket(t.deps)(authed({ itemId: ITEM, ...body })).then(read);
const finalize = (t: ReturnType<typeof setup>, body: Record<string, unknown>) => sellerMedia3dFinalize(t.deps)(authed({ itemId: ITEM, ...body })).then(read);
const hosted = (bytes = 5000) => ({ version: 1700000000, signature: "s".repeat(32), width: 1200, height: 800, bytes, format: "jpg" });

// ---- hop 1: ticket ----------------------------------------------------------------------------------------------------

Deno.test("ticket: a model gets a bucket path under the shop and item, a glb content type and a 15 MB cap, and is recorded", async () => {
  const t = setup({ cloud: false });   // models never touch Cloudinary
  const { status, body } = await ticket(t, { kind: "model-glb", type: "glb", size: 4 * MB });
  assertEquals(status, 200);
  assert(new RegExp(`^${BIZ}/${ITEM}/[0-9a-f-]{36}\\.glb$`).test(body.path));
  assertEquals([body.role, body.contentType, body.maxBytes, body.expiresIn, body.optionIds], ["model-glb", "model/gltf-binary", 15 * MB, 7200, []]);
  assert(body.token.includes(body.path));
  assertEquals(t.uploads.get(body.path), { business_id: BIZ, item_id: ITEM, purpose: "item_model" });
});

Deno.test("ticket limits: exactly 15 MB is fine, one byte more is refused before anything is recorded", async () => {
  const t = setup();
  assertEquals((await ticket(t, { kind: "model-glb", type: "glb", size: 15 * MB })).status, 200);
  const big = await ticket(t, { kind: "model-glb", type: "glb", size: 15 * MB + 1 });
  assertEquals([big.status, big.body], [413, { error: "too_large", maxBytes: 15 * MB }]);
  assertEquals((await ticket(t, { kind: "poster", type: "png", size: 10 * MB + 1 })).status, 413);
  assertEquals((await ticket(t, { kind: "spin-frame", type: "jpg", size: 10 * MB + 1 })).status, 413);
  assertEquals(t.uploads.size, 1, "only the 15 MB model was recorded");
});

Deno.test("ticket: wrong type, missing or bad size, unknown kind", async () => {
  const t = setup();
  for (const [kind, type] of [["model-glb", "gltf"], ["model-glb", "png"], ["model-glb", "application/octet-stream"], ["poster", "glb"], ["spin-frame", "gif"], ["video", "mov"]]) {
    assertEquals((await ticket(t, { kind, type, size: 100 })).body.error, "unsupported_type", `${kind} ${type}`);
  }
  assertEquals((await ticket(t, { kind: "model-glb", type: "glb" })).body.error, "bad_size");
  assertEquals((await ticket(t, { kind: "model-glb", type: "glb", size: -5 })).body.error, "bad_size");
  assertEquals((await ticket(t, { kind: "model-glb", type: "glb", size: 1.5 })).body.error, "bad_size");
  assertEquals((await ticket(t, { kind: "hologram", type: "glb", size: 5 })).status, 400);
  assertEquals((await ticket(t, { kind: "model-glb", type: "glb", size: 5, itemId: "nope" })).status, 400);
  assertEquals(t.uploads.size, 0);
});

Deno.test("ticket: a poster and a spin frame are Cloudinary pictures signed for one id under the item", async () => {
  const t = setup();
  const p = await ticket(t, { kind: "poster", type: "jpeg", size: MB });
  assertEquals(p.status, 200);
  assert(new RegExp(`^${BIZ}/${ITEM}/[0-9a-f-]{36}$`).test(p.body.publicId));
  assertEquals([p.body.role, p.body.maxBytes, t.uploads.get(p.body.publicId)?.purpose], ["poster", 10 * MB, "item_poster"]);
  const s = await ticket(t, { kind: "spin-frame", type: "webp", size: MB });
  assertEquals(t.uploads.get(s.body.publicId)?.purpose, "item_spin");
  assertEquals((await ticket(setup({ cloud: false }), { kind: "poster", type: "jpg", size: 1 })).status, 503);
});

Deno.test("ticket: callers and items it must refuse", async () => {
  const t = setup();
  assertEquals((await ticket(t, { kind: "poster", type: "jpg", size: 1, itemId: FOREIGN_ITEM })).status, 404);
  assertEquals((await read(await sellerMediaTicket(t.deps)(post({ kind: "poster", itemId: ITEM, type: "jpg", size: 1 })))).status, 401);
  assertEquals((await ticket(setup({ suspended: true }), { kind: "poster", type: "jpg", size: 1 })).status, 403);
  assertEquals(t.uploads.size, 0);
});

Deno.test("ticket: the 73rd spin frame is refused per scope; a model or poster may replace; the whole-item cap holds", async () => {
  const frames = (scope: string[], n: number) => Array.from({ length: n }, () => ({ kind: "spin", option_ids: scope }));
  const full = setup({ media: frames([], 72) });
  assertEquals(await ticket(full, { kind: "spin-frame", type: "jpg", size: 1 }), { status: 409, body: { error: "limit_reached", limit: "spin_frames", max: 72 } });
  assertEquals((await ticket(full, { kind: "spin-frame", type: "jpg", size: 1, optionIds: ["grey"] })).status, 200, "another colour has its own 72");
  assertEquals((await ticket(setup({ media: frames([], 71) }), { kind: "spin-frame", type: "jpg", size: 1 })).status, 200);
  const hasModel = setup({ media: [{ kind: "model", option_ids: [] }, { kind: "poster", option_ids: [] }] });
  assertEquals((await ticket(hasModel, { kind: "model-glb", type: "glb", size: 5 })).status, 200, "a new model replaces the old");
  assertEquals((await ticket(hasModel, { kind: "poster", type: "png", size: 5 })).status, 200);
  const cap = setup({ media: [...frames(["grey"], 72), ...frames(["black"], 72), ...frames(["a"], 72), ...frames(["b"], 72), ...frames(["c"], 72), ...frames(["d"], 72), ...frames(["e"], 72), ...frames([], 10)] });
  assertEquals((await ticket(cap, { kind: "spin-frame", type: "jpg", size: 1, optionIds: ["grey"] })).status, 409);
});

Deno.test("ticket: option ids are optional for 3D, at most one, and must exist on the item", async () => {
  const t = setup();
  const ok = await ticket(t, { kind: "model-glb", type: "glb", size: 5, optionIds: ["grey"] });
  assertEquals([ok.status, ok.body.optionIds], [200, ["grey"]]);
  assertEquals((await ticket(t, { kind: "model-glb", type: "glb", size: 5, optionIds: ["grey", "black"] })).body.error, "one_option_only");
  assertEquals((await ticket(t, { kind: "model-glb", type: "glb", size: 5, optionIds: ["purple"] })).body.error, "unknown_option_value");
  assertEquals((await ticket(t, { kind: "model-glb", type: "glb", size: 5, optionIds: ["Bad Id"] })).body.error, "bad_option_ids");
});

Deno.test("ticket: photos and videos still go through the existing signer, with role and maxBytes added", async () => {
  const t = setup();
  const img = await ticket(t, { kind: "image", type: "jpg" });
  assertEquals([img.status, img.body.role, img.body.maxBytes, typeof img.body.uploadUrl], [200, "image", 10 * MB, "string"]);
  assertEquals(t.uploads.get(img.body.publicId)?.purpose, "item_photo");
  const vid = await ticket(t, { kind: "video", type: "webm", size: 5 * MB });
  assertEquals([vid.status, vid.body.role, vid.body.maxBytes, vid.body.kind], [200, "video", 25 * MB, "video"]);
  assert(vid.body.path.endsWith(".webm"));
  assertEquals((await ticket(t, { kind: "video", type: "mp4", size: 26 * MB })).status, 413);
  assertEquals((await ticket(t, { kind: "image", type: "jpg", optionIds: ["grey"] })).status, 400, "photos take their values from seller_set_media_options");
  assertEquals((await ticket(t, { kind: "image", type: "jpg", itemId: FOREIGN_ITEM })).status, 404);
});

Deno.test("ticket: tickets that were never finished count against the item (160), and finishing one frees a place", async () => {
  const t = setup();
  const first = await ticket(t, { kind: "spin-frame", type: "jpg", size: 1 });
  for (let i = 1; i < 160; i++) await ticket(t, { kind: "spin-frame", type: "jpg", size: 1 });
  assertEquals(t.uploads.size, 160);
  assertEquals(await ticket(t, { kind: "spin-frame", type: "jpg", size: 1 }), { status: 429, body: { error: "too_many_pending", max: 160 } });
  assertEquals((await ticket(t, { kind: "poster", type: "jpg", size: 1 })).status, 429, "the cap is for every 3D kind");
  t.uploads.delete(first.body.publicId);   // finalized (or swept)
  assertEquals((await ticket(t, { kind: "poster", type: "jpg", size: 1 })).status, 200);
  assertEquals(t.uploads.size, 160);
  // a photo or video ticket is not a 3D ticket and is not counted
  assertEquals((await ticket(t, { kind: "image", type: "jpg" })).status, 200);
});

Deno.test("ticket: a shop that asks too often is slowed down", async () => {
  const t = setup();
  let last: { status: number; body: any } = { status: 0, body: null };
  for (let i = 0; i < 401; i++) { t.uploads.clear(); last = await ticket(t, { kind: "poster", type: "jpg", size: 1 }); }   // cleared: this tests the rate limit, not the pending cap
  assertEquals(last.status, 429);
  assert(last.body.error !== "too_many_pending");
});

// ---- hop 3: finalize --------------------------------------------------------------------------------------------------

async function modelTicket(t: ReturnType<typeof setup>, bytes: Uint8Array | Blob | null, extra: Record<string, unknown> = {}) {
  const { body } = await ticket(t, { kind: "model-glb", type: "glb", size: 1000, ...extra });
  if (bytes) t.objects.set(body.path, bytes);
  return body.path as string;
}

Deno.test("finalize model: a real glb is attached with its real size, the glb mime and the scope from the request", async () => {
  const t = setup();
  const file = glb({ asset: { version: "2.0" }, images: [{ uri: "data:image/png;base64,AAAA" }] });
  const path = await modelTicket(t, file, { optionIds: ["grey"] });
  const r = await finalize(t, { path, optionIds: ["grey"] });
  assertEquals([r.status, r.body.role, r.body.kind, r.body.size], [201, "model-glb", "model", file.length]);
  assertEquals(t.attached[0], { p_item: ITEM, p_role: "model-glb", p_path: path, p_mime: "model/gltf-binary", p_width: null, p_height: null, p_size: file.length, p_option_ids: ["grey"], p_position: null });
  assertEquals(t.removed, []);
});

Deno.test("finalize model: a png renamed .glb, a corrupt file and a model that points at another site are deleted and queued", async () => {
  for (const [bytes, error] of [[png(), "unsupported_type"], [glb(undefined, { lengthDelta: 8 }), "corrupt"], [glb({ asset: { version: "2.0" }, buffers: [{ uri: "https://t.example/x.bin" }] }), "external_resources"], [glb(undefined, { version: 1 }), "unsupported_type"]] as const) {
    const t = setup();
    const path = await modelTicket(t, bytes);
    const r = await finalize(t, { path });
    assertEquals([r.status, r.body.error], [422, error]);
    assertEquals(t.attached.length, 0);
    assertEquals(t.removed, [path]);
    assertEquals(t.queued, [{ ids: [path], reason: "model_refused" }]);
  }
});

Deno.test("finalize model: over 15 MB is refused from its size alone (never read into memory)", async () => {
  const t = setup();
  let read = false;
  const huge = { size: 15 * MB + 1, arrayBuffer: () => { read = true; return Promise.resolve(new ArrayBuffer(0)); } } as unknown as Blob;
  const path = await modelTicket(t, huge);
  const r = await finalize(t, { path });
  assertEquals([r.status, r.body.error, read], [413, "too_large", false]);
  assertEquals(t.removed, [path]);
});

Deno.test("finalize: the ticket decides the role; foreign, unknown, used and wrongly-typed paths are refused", async () => {
  const t = setup();
  const path = await modelTicket(t, glb());
  assertEquals((await finalize(t, { path: path.replace(BIZ, OTHER) })).status, 403);
  assertEquals((await finalize(t, { path: `${BIZ}/${ITEM}/${uuid()}.glb` })).status, 404, "never ticketed");
  assertEquals((await finalize(t, { path: `${BIZ}/${ITEM}/../x.glb` })).status, 403);
  assertEquals((await finalize(t, { path, itemId: FOREIGN_ITEM })).status, 403, "path must sit under the item");
  assertEquals((await read(await sellerMedia3dFinalize(t.deps)(post({ itemId: ITEM, path })))).status, 401);
  assertEquals((await finalize(setup({ suspended: true }), { path })).status, 403);
  const video = await ticket(t, { kind: "video", type: "mp4", size: 5 });
  assertEquals((await finalize(t, { path: video.body.path })).status, 403, "a video ticket cannot become a model");
  assertEquals((await finalize(t, { path, optionIds: ["a", "b"] })).body.error, "one_option_only");
  assertEquals(t.uploads.has(path), true, "a refused request does not use up the ticket");
  assertEquals((await finalize(t, { path })).status, 201);
  assertEquals((await finalize(t, { path })).status, 409, "the same file twice");
});

Deno.test("finalize poster and spin frame: verified against Cloudinary, size limited, position kept", async () => {
  const t = setup();
  const p = (await ticket(t, { kind: "poster", type: "jpg", size: 100 })).body.publicId;
  const a = await finalize(t, { path: p, cloudinary: hosted() });
  assertEquals([a.status, a.body.role, a.body.kind, a.body.width, a.body.height], [201, "poster", "poster", 1200, 800]);
  assertEquals(t.attached[0].p_mime, "image/jpeg");
  assertEquals(t.attached[0].p_position, null);
  const f = (await ticket(t, { kind: "spin-frame", type: "jpg", size: 100 })).body.publicId;
  const b = await finalize(t, { path: f, position: 7, cloudinary: hosted() });
  assertEquals([b.status, b.body.kind, t.attached[1].p_position], [201, "spin", 7]);
  assertEquals((await finalize(t, { path: f, position: 72, cloudinary: hosted() })).status, 400);
  assertEquals((await finalize(t, { path: f, position: -1, cloudinary: hosted() })).status, 400);
});

Deno.test("finalize picture: a bad signature or missing report keeps the ticket; an oversized picture is queued; Cloudinary missing is a 503", async () => {
  const t = setup({ verify: false });
  const p = (await ticket(t, { kind: "poster", type: "jpg", size: 100 })).body.publicId;
  assertEquals((await finalize(t, { path: p, cloudinary: hosted() })).status, 403);
  assertEquals((await finalize(t, { path: p })).status, 400);
  assertEquals(t.uploads.has(p), true);
  const ok = setup();
  const q = (await ticket(ok, { kind: "poster", type: "jpg", size: 100 })).body.publicId;
  const big = await finalize(ok, { path: q, cloudinary: hosted(10 * MB + 1) });
  assertEquals([big.status, big.body.error], [413, "too_large"]);
  assertEquals(ok.queued, [{ ids: [q], reason: "picture_refused" }]);
  const down = setup();
  const r = (await ticket(down, { kind: "poster", type: "jpg", size: 100 })).body.publicId;
  (down.deps as any).cloudinary = null;
  assertEquals((await finalize(down, { path: r, cloudinary: hosted() })).status, 503);
  assertEquals(down.uploads.has(r), true);
});

Deno.test("finalize: when the database refuses the attach the file is queued for deletion and the reason is passed on", async () => {
  for (const [msg, status, error] of [["limit_reached:spin_frames", 409, "limit_reached"], ["limit_reached:media3d", 409, "limit_reached"], ["unknown_option_value", 422, "unknown_option_value"], ["bad_position", 422, "bad_position"], ["weird db failure", 500, "server_error"]] as const) {
    const t = setup({ attachError: msg });
    const p = (await ticket(t, { kind: "spin-frame", type: "jpg", size: 100 })).body.publicId;
    const r = await finalize(t, { path: p, cloudinary: hosted() });
    assertEquals([r.status, r.body.error], [status, error], msg);
    assertEquals(t.queued.length, 1, msg);
  }
  const t = setup({ attachError: "limit_reached:spin_frames" });
  const p = (await ticket(t, { kind: "spin-frame", type: "jpg", size: 100 })).body.publicId;
  assertEquals((await finalize(t, { path: p, cloudinary: hosted() })).body.limit, "spin_frames");
});

// ---- cleanup and copy ---------------------------------------------------------------------------------------------------

Deno.test("cleanup: a .glb goes to the bucket, never to Cloudinary; pictures still go to Cloudinary", async () => {
  const t = setup();
  const removedFromBucket: string[] = [];
  const destroyed: string[] = [];
  const doneIds: string[] = [];
  const d = t.deps as any;
  d.db.storage = { from: () => ({ remove: (p: string[]) => { removedFromBucket.push(...p); return Promise.resolve({ error: null }); } }) };
  d.cloudinary.destroy = (ids: string[]) => { destroyed.push(...ids); return Promise.resolve({ deleted: ids, failed: [] }); };
  const rpc = d.db.rpc; d.db.rpc = (n: string, a: any) => { if (n === "media_gc_done") doneIds.push(...a.p_ids); return rpc(n, a); };
  const model = `${BIZ}/${ITEM}/${uuid()}.glb`, video = `${BIZ}/${ITEM}/${uuid()}.mp4`, pic = `${BIZ}/${ITEM}/${uuid()}`;
  assertEquals(await settleDeletes(d, [model, video, pic]), { deleted: 3, failed: 0 });
  assertEquals(removedFromBucket, [model, video]);
  assertEquals(destroyed, [pic]);
  assertEquals(doneIds.sort(), [model, video, pic].sort());
});

Deno.test("duplicate item: photos, videos, model, poster and spin frames are copied as new files, in order, keeping their option values", async () => {
  const t = setup();
  const TARGET = "20000000-0000-4000-8000-0000000000c9";
  const items = [{ id: ITEM, business_id: BIZ }, { id: TARGET, business_id: BIZ }];
  const row = (id: string, kind: string, path: string, sort: number, option_ids: string[] = []) => ({ id, kind, path, mime: kind === "model" ? "model/gltf-binary" : "image/jpeg", width: 1, height: 1, duration_sec: null, size_bytes: 7, sort, option_ids });
  const src = [
    row("m1", "image", `${BIZ}/${ITEM}/${uuid()}`, 0, ["grey", "black"]),
    row("m2", "model", `${BIZ}/${ITEM}/${uuid()}.glb`, 0, ["grey"]),
    row("m3", "poster", `${BIZ}/${ITEM}/${uuid()}`, 0, ["grey"]),
    row("f9", "spin", `${BIZ}/${ITEM}/${uuid()}`, 9),
    row("f2", "spin", `${BIZ}/${ITEM}/${uuid()}`, 2),
    row("f5", "spin", `${BIZ}/${ITEM}/${uuid()}`, 5),
  ].sort((a, b) => a.sort - b.sort);   // the handler asks the database for sort order
  const d = t.deps as any;
  const from = d.db.from;
  const updates: any[] = [];
  const copiedPictures: [string, string][] = [];
  const copiedFiles: [string, string][] = [];
  d.cloudinary.copy = (a: string, b: string) => { copiedPictures.push([a, b]); return Promise.resolve(true); };
  const store = d.db.storage.from();
  d.db.storage = { from: () => ({ ...store, copy: (a: string, b: string) => { copiedFiles.push([a, b]); return Promise.resolve({ error: null }); } }) };
  d.db.from = (table: string) => {
    if (table === "items") { const eqs: [string, unknown][] = []; const api: any = { select: () => api, eq: (c: string, v: unknown) => (eqs.push([c, v]), api), maybeSingle: () => Promise.resolve({ data: items.find((i) => eqs.every(([c, v]) => (i as any)[c] === v)) ?? null, error: null }) }; return api; }
    if (table === "item_media") { const api: any = { select: () => api, eq: () => api, limit: () => Promise.resolve({ data: [], error: null }), order: () => Promise.resolve({ data: src, error: null }), update: (v: unknown) => ({ eq: (_c: string, id: string) => { updates.push([id, v]); return Promise.resolve({ error: null }); } }) }; return api; }
    return from(table);
  };
  const rpc = d.db.rpc; const photoAttach: any[] = [];
  d.db.rpc = (n: string, a: any) => { if (n === "attach_item_media") { photoAttach.push(a); return Promise.resolve({ data: "new-photo-id", error: null }); } return rpc(n, a); };
  const r = await sellerItemCopyMedia(t.deps)(authed({ fromItemId: ITEM, toItemId: TARGET })).then(read);
  assertEquals([r.status, r.body.copied, r.body.total, r.body.failed], [200, 6, 6, []]);
  assertEquals(copiedFiles.length, 1);
  assert(copiedFiles[0][1].startsWith(`${BIZ}/${TARGET}/`) && copiedFiles[0][1].endsWith(".glb"), "the model is a new .glb under the new item");
  assertEquals(copiedPictures.length, 5);
  assert(copiedPictures.every(([from, to]) => from !== to && to.startsWith(`${BIZ}/${TARGET}/`)));
  const by = (role: string) => t.attached.filter((a) => a.p_role === role);
  assertEquals(by("model-glb")[0].p_option_ids, ["grey"]);
  assertEquals(by("poster")[0].p_option_ids, ["grey"]);
  assertEquals(by("spin-frame").map((a) => a.p_position), [0, 1, 2], "frames keep their order, numbered from 0");
  assertEquals(by("spin-frame").map((a) => a.p_path), copiedPictures.filter(([from]) => src.some((s) => s.kind === "spin" && s.path === from)).map(([, to]) => to));
  assertEquals(updates, [["new-photo-id", { option_ids: ["grey", "black"] }]], "the photo keeps its colours");
  assertEquals(photoAttach.length, 1);
  // every copy was registered with the right purpose before it was copied
  assertEquals(t.registered.map((x: any) => x.p_purpose).sort(), ["item_model", "item_photo", "item_poster", "item_spin", "item_spin", "item_spin"]);
});

Deno.test("duplicate item: a 3D copy the database refuses is reported and queued, and the rest still copy", async () => {
  const t = setup({ attachError: "unknown_option_value" });
  const TARGET = "20000000-0000-4000-8000-0000000000c9";
  const items = [{ id: ITEM, business_id: BIZ }, { id: TARGET, business_id: BIZ }];
  const d = t.deps as any;
  const from = d.db.from;
  const src = [{ id: "m3", kind: "poster", path: `${BIZ}/${ITEM}/${uuid()}`, mime: "image/jpeg", width: 1, height: 1, duration_sec: null, size_bytes: 1, sort: 0, option_ids: ["gone"] }];
  d.db.from = (table: string) => {
    if (table === "items") { const eqs: [string, unknown][] = []; const api: any = { select: () => api, eq: (c: string, v: unknown) => (eqs.push([c, v]), api), maybeSingle: () => Promise.resolve({ data: items.find((i) => eqs.every(([c, v]) => (i as any)[c] === v)) ?? null, error: null }) }; return api; }
    if (table === "item_media") { const api: any = { select: () => api, eq: () => api, limit: () => Promise.resolve({ data: [], error: null }), order: () => Promise.resolve({ data: src, error: null }) }; return api; }
    return from(table);
  };
  const r = await sellerItemCopyMedia(t.deps)(authed({ fromItemId: ITEM, toItemId: TARGET })).then(read);
  assertEquals([r.body.copied, r.body.failed.length, t.queued.length], [0, 1, 1]);
});
