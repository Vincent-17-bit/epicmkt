import nodeAssert from "node:assert/strict";
import { sellerMediaSign } from "../functions/seller-media-sign/handler.ts";
import { sellerMediaFinalize } from "../functions/seller-media-finalize/handler.ts";
import { mediaGc } from "../functions/media-gc/handler.ts";
import { settleDeletes } from "../functions/_shared/mediaGc.ts";
import type { Deps } from "../functions/_shared/seller.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);

// The video pipeline, one test per hop: sign -> bucket -> finalize -> (list and public read are in item-media.test.mjs) -> cleanup.

const BIZ = "10000000-0000-4000-8000-0000000000a1";
const OTHER = "10000000-0000-4000-8000-0000000000b1";
const ITEM = "20000000-0000-4000-8000-0000000000c1";
const ITEM2 = "20000000-0000-4000-8000-0000000000c3";
const FOREIGN_ITEM = "20000000-0000-4000-8000-0000000000c2";
const TOKEN = "token-1";
const uuid = () => crypto.randomUUID();
const vpath = (ext = "mp4", biz = BIZ, item = ITEM) => `${biz}/${item}/${uuid()}.${ext}`;

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));
const box = (name: string, ...parts: number[][]) => { const body = parts.flat(); return [...be32(body.length + 8), ...str(name), ...body]; };
// A phone-style MP4: an audio track first, the real video track second, and the media data BEFORE the moov box.
const mp4 = (w: number, h: number, seconds: number, scale = 1000) => {
  const mvhd = box("mvhd", [0, 0, 0, 0], be32(0), be32(0), be32(scale), be32(seconds * scale), new Array(80).fill(0));
  const tkhd = (tw: number, th: number) => box("tkhd", [0, 0, 0, 3], be32(0), be32(0), be32(1), be32(0), be32(seconds * scale), new Array(8).fill(0), [0, 0, 0, 0, 0, 0, 0, 0], new Array(36).fill(0), be32(tw * 65536), be32(th * 65536));
  return Uint8Array.from([...box("ftyp", str("isom"), be32(0), str("isom")), ...box("mdat", [1, 2, 3, 4]), ...box("moov", mvhd, box("trak", tkhd(0, 0)), box("trak", tkhd(w, h)))]);
};
const ebml = (id: number[], payload: number[]) => [...id, 0x80 | payload.length, ...payload];
const ebmlBig = (id: number[], payload: number[]) => [...id, 0x40 | (payload.length >> 8), payload.length & 255, ...payload];
const webm = (w: number, h: number, seconds: number) => {
  const dur = new Uint8Array(4); new DataView(dur.buffer).setFloat32(0, seconds * 1000);
  const info = ebml([0x15, 0x49, 0xa9, 0x66], [...ebml([0x2a, 0xd7, 0xb1], be32(1000000)), ...ebml([0x44, 0x89], [...dur])]);
  const video = ebml([0xe0], [...ebml([0xb0], [w >> 8, w & 255]), ...ebml([0xba], [h >> 8, h & 255])]);
  const tracks = ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], video));
  return Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, ...str("webm"), ...ebmlBig([0x18, 0x53, 0x80, 0x67], [...info, ...tracks])]);
};
const jpeg = (w: number, h: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
const pad = (b: Uint8Array, n: number) => { const o = new Uint8Array(Math.max(n, b.length)); o.set(b); return o; };

function setup(opts: { cloud?: boolean; videoLimit?: number } = {}) {
  const uploads = new Map<string, { business_id: string; item_id: string | null; purpose: string }>();
  const media: { id: string; path: string; kind: string; item_id: string }[] = [];
  const objects = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const calls: { name: string; args: any }[] = [];
  const fail: Record<string, any> = {};
  const counters = new Map<string, number>();
  const items = [{ id: ITEM, business_id: BIZ }, { id: ITEM2, business_id: BIZ }, { id: FOREIGN_ITEM, business_id: OTHER }];
  const query = (t: string) => {
    const eqs: [string, unknown][] = [];
    const rows = () => (t === "items" ? items : t === "item_media" ? media : t === "businesses" ? [{ id: BIZ, seller_id: "ES1", phone: "+254712345678", name: "A", status: "live", user_id: "u1" }] : []);
    const api: any = { select: () => api, neq: () => api, eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
      maybeSingle: () => Promise.resolve({ data: (rows() as any[]).find((r) => eqs.every(([c, v]) => r[c] === v)) ?? null, error: null }) };
    return api;
  };
  const rpc = (name: string, a: any) => {
    calls.push({ name, args: a });
    if (fail[name]) return Promise.resolve({ data: null, error: { message: fail[name] } });
    if (name === "hit_rate_limit") { const n = (counters.get(a.p_key) ?? 0) + 1; counters.set(a.p_key, n); return Promise.resolve({ data: n <= a.p_max, error: null }); }
    if (name === "media_limit_ok") return Promise.resolve({ data: media.filter((m) => m.item_id === a.p_item && m.kind === a.p_kind).length < (opts.videoLimit ?? 2), error: null });
    if (name === "media_register_upload") {
      if (a.p_purpose === "item_video" && !items.find((i) => i.id === a.p_item && i.business_id === a.p_business)) return Promise.resolve({ data: null, error: { message: "item_not_found" } });
      uploads.set(a.p_public_id, { business_id: a.p_business, item_id: a.p_item, purpose: a.p_purpose });
      return Promise.resolve({ data: null, error: null });
    }
    if (name === "media_confirm_upload") {
      const u = uploads.get(a.p_public_id);
      return Promise.resolve(u && u.business_id === a.p_business ? { data: { purpose: u.purpose, item_id: u.item_id }, error: null } : { data: null, error: { message: "upload_not_found" } });
    }
    if (name === "attach_item_media") {
      if (media.filter((m) => m.item_id === a.p_item && m.kind === a.p_kind).length >= (opts.videoLimit ?? 2)) return Promise.resolve({ data: null, error: { message: "limit_reached:item_media" } });
      const id = uuid(); media.push({ id, path: a.p_path, kind: a.p_kind, item_id: a.p_item });
      return Promise.resolve({ data: id, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };
  const storage = { from: () => ({
    createSignedUploadUrl: (path: string) => Promise.resolve(fail.signedUrl ? { data: null, error: { message: "bucket missing" } } : { data: { token: `upload-token-for-${path}`, path }, error: null }),
    download: (path: string) => Promise.resolve(objects.has(path) ? { data: new Blob([objects.get(path)!]), error: null } : { data: null, error: { message: "Object not found" } }),
    remove: (paths: string[]) => { if (fail.remove) return Promise.resolve({ data: null, error: { message: "storage down" } }); removed.push(...paths); paths.forEach((p) => objects.delete(p)); return Promise.resolve({ data: [], error: null }); },
  }) };
  const db = { from: query, rpc: (n: string, a: any) => rpc(n, a), storage, auth: { getUser: (t: string) => Promise.resolve(t === TOKEN ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { message: "bad" } }) } };
  const deps = { db, anon: {}, salt: "s", code: () => "1", sms: () => Promise.resolve(true), email: () => Promise.resolve(true), cronSecret: "cron",
    cloudinary: opts.cloud === false ? null : { cloudName: "demo", signUpload: () => Promise.resolve({ uploadUrl: "u", fields: {} }), verifyResponse: () => Promise.resolve(true), destroy: (ids: string[]) => Promise.resolve({ deleted: ids, failed: [] }) } } as unknown as Deps;
  return { deps, uploads, media, objects, removed, calls, fail };
}
const post = (body: unknown, headers: Record<string, string> = {}) => new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const authed = (body: unknown) => post(body, { authorization: `Bearer ${TOKEN}` });
const read = async (r: Response) => ({ status: r.status, body: await r.json() });
const signVideo = async (t: ReturnType<typeof setup>, itemId = ITEM, type = "mp4") => read(await sellerMediaSign(t.deps)(authed({ purpose: "item_video", itemId, type })));
// Sign, "upload" the given bytes to the bucket at the signed path, then finalize it.
async function run(t: ReturnType<typeof setup>, bytes: Uint8Array | null, type = "mp4", itemId = ITEM) {
  const signed = await signVideo(t, itemId, type);
  assertEquals(signed.status, 200);
  if (bytes) t.objects.set(signed.body.path, bytes);
  const fin = await read(await sellerMediaFinalize(t.deps)(authed({ itemId, path: signed.body.path })));
  return { signed: signed.body, fin };
}

// ---- hop 1: sign ----------------------------------------------------------------------------------------------------

Deno.test("video sign: works without Cloudinary, records the upload, and hands back a ticket under the shop and item", async () => {
  const t = setup({ cloud: false });
  const { status, body } = await signVideo(t);
  assertEquals(status, 200);
  assert(new RegExp(`^${BIZ}/${ITEM}/[0-9a-f-]{36}\\.mp4$`).test(body.path));
  assertEquals(body.kind, "video");
  assert(body.token.includes(body.path));
  assertEquals(t.uploads.get(body.path), { business_id: BIZ, item_id: ITEM, purpose: "item_video" });
  assertEquals((await signVideo(t, ITEM, "webm")).body.path.endsWith(".webm"), true);
});

Deno.test("video sign: refuses other shops' items, a full plan, bad types, anonymous callers and server trouble", async () => {
  const t = setup();
  assertEquals((await signVideo(t, FOREIGN_ITEM)).status, 404);
  assertEquals(t.uploads.size, 0);
  assertEquals((await read(await sellerMediaSign(t.deps)(authed({ purpose: "item_video", itemId: ITEM, type: "mov" })))).status, 400);
  assertEquals((await read(await sellerMediaSign(t.deps)(authed({ purpose: "item_video", itemId: "nope", type: "mp4" })))).status, 400);
  assertEquals((await read(await sellerMediaSign(t.deps)(post({ purpose: "item_video", itemId: ITEM, type: "mp4" })))).status, 401);
  const full = setup({ videoLimit: 0 });
  assertEquals(await signVideo(full), { status: 409, body: { error: "limit_reached" } });
  const noReg = setup(); noReg.fail.media_register_upload = "boom";
  assertEquals((await signVideo(noReg)).status, 500);
  const noUrl = setup(); noUrl.fail.signedUrl = true;
  assertEquals((await signVideo(noUrl)).status, 500);
});

// ---- hop 3: finalize (hop 2 is the browser sending the bytes to the bucket) ------------------------------------------

Deno.test("video finalize: a real phone-style mp4 (audio track first, moov after the media) and a webm are attached", async () => {
  const t = setup();
  const a = await run(t, mp4(1280, 720, 12.5));
  assertEquals(a.fin.status, 201);
  assertEquals([a.fin.body.kind, a.fin.body.width, a.fin.body.height, a.fin.body.durationSec], ["video", 1280, 720, 12.5]);
  const b = await run(t, webm(854, 480, 7), "webm");
  assertEquals(b.fin.status, 201);
  assertEquals([b.fin.body.width, b.fin.body.height, b.fin.body.durationSec], [854, 480, 7]);
  assertEquals(t.media.map((m) => m.path), [a.signed.path, b.signed.path]);
  assertEquals(t.removed, []);
});

Deno.test("video finalize: wrong type, too big, too long and unreadable files are rejected with the codes the seller app maps, and the file is deleted", async () => {
  const cases: [string, Uint8Array, number, string][] = [
    ["a picture sent as a video", jpeg(800, 600), 422, "unsupported_type"],
    ["text", new TextEncoder().encode("hello world, not a video at all"), 422, "unsupported_type"],
    ["a video over 25 MB", pad(mp4(640, 480, 5), 25 * 1024 * 1024 + 1), 422, "too_large"],
    ["a video over 60 seconds", mp4(640, 480, 61), 422, "too_long"],
    ["an mp4 with no readable moov", Uint8Array.from([...box("ftyp", str("isom"), be32(0), str("isom")), ...box("mdat", [1, 2, 3])]), 422, "unreadable"],
    ["a video larger than 8000 px", mp4(9000, 700, 5), 422, "too_big_dimensions"],
    ["webm bytes under an .mp4 name", webm(640, 480, 5), 422, "unsupported_type"],
  ];
  for (const [label, bytes, status, error] of cases) {
    const t = setup();
    const { signed, fin } = await run(t, bytes);
    assertEquals([label, fin.status, fin.body.error], [label, status, error]);
    assertEquals(t.media.length, 0);
    assertEquals(t.removed, [signed.path]);
    assert(!t.objects.has(signed.path), `${label}: file left behind`);
  }
  const t = setup();
  assertEquals((await run(t, mp4(640, 480, 60))).fin.status, 201, "exactly 60 seconds is allowed");
  assertEquals((await run(setup(), pad(mp4(640, 480, 5), 25 * 1024 * 1024))).fin.status, 201, "exactly 25 MB is allowed");
});

Deno.test("video finalize: only a path this shop was signed for, under this item, with a video extension", async () => {
  const t = setup();
  const finalize = async (path: string, itemId = ITEM) => read(await sellerMediaFinalize(t.deps)(authed({ itemId, path })));
  const bytes = mp4(640, 480, 5);
  const unsigned = vpath(); t.objects.set(unsigned, bytes);
  assertEquals(await finalize(unsigned), { status: 404, body: { error: "upload_not_found" } });
  const foreignBiz = vpath("mp4", OTHER); t.objects.set(foreignBiz, bytes);
  assertEquals((await finalize(foreignBiz)).status, 403);
  const signed = (await signVideo(t)).body.path; t.objects.set(signed, bytes);
  assertEquals((await finalize(signed, ITEM2)).status, 403, "signed for another item");
  assertEquals((await finalize(`${BIZ}/${ITEM}/../x.mp4`)).status, 403);
  const img = `${BIZ}/${ITEM}/${uuid()}.jpg`; t.objects.set(img, jpeg(800, 600));
  assertEquals(await finalize(img), { status: 422, body: { error: "unsupported_type" } });
  assertEquals((await read(await sellerMediaFinalize(t.deps)(authed({ path: signed })))).status, 400, "an item id is required");
  assertEquals((await read(await sellerMediaFinalize(t.deps)(post({ itemId: ITEM, path: signed })))).status, 401);
  assertEquals(t.media.length, 0);
  assertEquals((await finalize(signed)).status, 201, "the right path then works");
});

Deno.test("video finalize: a missing file, a repeated call, a full plan and a transient failure behave", async () => {
  const none = setup();
  assertEquals((await run(none, null)).fin, { status: 404, body: { error: "file_not_found" } });
  assertEquals(none.media.length, 0);

  const t = setup();
  const { signed, fin } = await run(t, mp4(640, 480, 5));
  assertEquals(fin.status, 201);
  const again = await read(await sellerMediaFinalize(t.deps)(authed({ itemId: ITEM, path: signed.path })));
  assertEquals(again, { status: 409, body: { error: "already_attached" } });
  assertEquals(t.media.length, 1);

  const limit = setup({ videoLimit: 1 });
  assertEquals((await run(limit, mp4(640, 480, 5))).fin.status, 201);
  // The plan filled up between sign and finalize (two uploads started together): the second file is refused and deleted.
  const second = setup({ videoLimit: 1 });
  const s1 = (await signVideo(second)).body.path, s2 = (await signVideo(second)).body.path;
  second.objects.set(s1, mp4(640, 480, 5)); second.objects.set(s2, mp4(640, 480, 5));
  assertEquals((await read(await sellerMediaFinalize(second.deps)(authed({ itemId: ITEM, path: s1 })))).status, 201);
  assertEquals((await read(await sellerMediaFinalize(second.deps)(authed({ itemId: ITEM, path: s2 })))), { status: 409, body: { error: "limit_reached" } });
  assertEquals(second.removed, [s2]);

  const flaky = setup();
  const sg = (await signVideo(flaky)).body.path; flaky.objects.set(sg, mp4(640, 480, 5));
  flaky.fail.attach_item_media = "connection reset";
  assertEquals((await read(await sellerMediaFinalize(flaky.deps)(authed({ itemId: ITEM, path: sg })))).status, 500);
  assert(flaky.objects.has(sg), "a transient error keeps the file so the retry can finish");
  delete flaky.fail.attach_item_media;
  assertEquals((await read(await sellerMediaFinalize(flaky.deps)(authed({ itemId: ITEM, path: sg })))).status, 201, "the retry works: the ticket is still valid");
});

// ---- cleanup: nothing is left behind ----------------------------------------------------------------------------------

Deno.test("cleanup: queued video files are deleted from the bucket; a storage outage keeps them queued", async () => {
  const t = setup();
  const a = vpath(), b = vpath("webm"), photo = `${BIZ}/${ITEM}/${uuid()}`;
  [a, b].forEach((p) => t.objects.set(p, mp4(640, 480, 5)));
  assertEquals(await settleDeletes(t.deps, [a, b, photo]), { deleted: 3, failed: 0 });
  assertEquals(t.removed, [a, b]);
  assertEquals(t.calls.filter((c) => c.name === "media_gc_done").map((c) => c.args.p_ids), [[a, b], [photo]]);

  const down = setup(); down.fail.remove = true;
  assertEquals(await settleDeletes(down.deps, [a]), { deleted: 0, failed: 1 });
  assertEquals(down.calls.find((c) => c.name === "media_gc_fail")!.args, { p_ids: [a], p_error: "storage down" });
  assertEquals(down.calls.some((c) => c.name === "media_gc_done"), false);

  const noCloud = setup({ cloud: false });
  assertEquals(await settleDeletes(noCloud.deps, [a, photo]), { deleted: 1, failed: 0 }, "videos are deleted even when Cloudinary is not configured");
});

Deno.test("cleanup: the cron job sweeps abandoned uploads and deletes the video files it claims", async () => {
  const t = setup();
  const abandoned = vpath();
  t.objects.set(abandoned, mp4(640, 480, 5));
  (t.deps.db as any).rpc = ((orig) => (n: string, a: any) => n === "media_gc_claim" ? Promise.resolve({ data: [{ public_id: abandoned }], error: null }) : orig(n, a))((t.deps.db as any).rpc);
  const res = await read(await mediaGc(t.deps)(new Request("http://x/", { method: "POST", headers: { "x-cron-secret": "cron" }, body: "{}" })));
  assertEquals(res.body, { swept: 0, deleted: 1, failed: 0 });
  assertEquals(t.removed, [abandoned]);
  assertEquals(t.calls.map((c) => c.name).filter((n) => n.startsWith("media_")), ["media_sweep_orphans", "media_gc_done"]);
});
