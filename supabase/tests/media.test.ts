import nodeAssert from "node:assert/strict";
import { sellerMediaFinalize } from "../functions/seller-media-finalize/handler.ts";
import { sellerMediaRemove } from "../functions/seller-media-remove/handler.ts";
import { sellerMediaCopy } from "../functions/seller-media-copy/handler.ts";
import type { Deps } from "../functions/_shared/seller.ts";
// @ts-ignore plain JS fixtures shared with the browser tests
import { png, jpeg, webp, mp4, mov, webm, heic, pad, disguised } from "../../shared/src/seller/media-fixtures.js";

const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);

const BIZ = "10000000-0000-4000-8000-0000000000a1";
const OTHER_BIZ = "10000000-0000-4000-8000-0000000000b1";
const ITEM = "20000000-0000-4000-8000-000000000001";
const ITEM2 = "20000000-0000-4000-8000-000000000002";
const FOREIGN_ITEM = "20000000-0000-4000-8000-0000000000ff";
const uid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const obj = (biz: string, item: string, media: string, file = "main.webp") => `${biz}/${item}/${media}/${file}`;

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const TOKEN = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", session_id: "s1" })}.sig`;

type Row = Record<string, any>;
type World = {
  tables: { items: Row[]; item_media: Row[]; businesses: Row[] };
  files: Map<string, Uint8Array>;
  removed: string[];
  counters: Map<string, number>;
  limits: { image: number; video: number };
  failRemove: boolean;
  failCopyAt: number | null;
  copies: [string, string][];
  rpc: { name: string; args: any }[];
};

function world(): World {
  return {
    tables: {
      businesses: [{ id: BIZ, seller_id: "ES100001", phone: "+254712345678", name: "Shop A", status: "live", user_id: "u1" }],
      items: [
        { id: ITEM, business_id: BIZ, variants: [{ id: "va", label: "Red" }, { id: "vb", label: "Blue" }] },
        { id: ITEM2, business_id: BIZ, variants: [{ id: "na", label: "Red" }, { id: "nb", label: "Blue" }] },
        { id: FOREIGN_ITEM, business_id: OTHER_BIZ, variants: [] },
      ],
      item_media: [],
    },
    files: new Map(), removed: [], counters: new Map(), limits: { image: 7, video: 1 }, failRemove: false, failCopyAt: null, copies: [], rpc: [],
  };
}

function deps(w: World): Deps {
  const query = (t: keyof World["tables"]) => {
    const eqs: [string, unknown][] = [];
    const nes: [string, unknown][] = [];
    let op: "select" | "delete" = "select";
    const rows = () => w.tables[t].filter((r) => eqs.every(([c, v]) => r[c] === v) && nes.every(([c, v]) => r[c] !== v));
    const run = () => {
      if (op === "delete") {
        const gone = new Set(rows());
        w.tables[t] = w.tables[t].filter((r) => !gone.has(r));
        return { data: null, error: null };
      }
      return { data: rows(), error: null };
    };
    const api: any = {
      select: () => api, limit: () => api,
      delete: () => { op = "delete"; return api; },
      eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
      neq: (c: string, v: unknown) => (nes.push([c, v]), api),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  };

  const attach = (a: any) => {
    const item = w.tables.items.find((i) => i.id === a.p_item);
    if (!item) return { data: null, error: { message: "item_not_found" } };
    const folder = `${item.business_id}/${a.p_item}/${a.p_media}/`;
    const owned = (p: string) => p.startsWith(folder) && !p.includes("..");
    if (!owned(a.p_path) || (a.p_poster && !owned(a.p_poster)) || Object.values(a.p_variants ?? {}).some((p) => !owned(p as string))) return { data: null, error: { message: "path_not_owned" } };
    if (a.p_poster && a.p_kind !== "video") return { data: null, error: { message: "poster_only_video" } };
    let old: Row | undefined;
    if (a.p_replace) {
      old = w.tables.item_media.find((m) => m.id === a.p_replace && m.item_id === a.p_item);
      if (!old) return { data: null, error: { message: "media_not_found" } };
      if (old.removed_by_admin) return { data: null, error: { message: "removed_by_admin" } };
      if (old.kind !== a.p_kind) return { data: null, error: { message: "kind_mismatch" } };
    }
    if (a.p_variant_id && !(item.variants ?? []).some((v: any) => v.id === a.p_variant_id)) return { data: null, error: { message: "variant_not_found" } };
    const counted = w.tables.item_media.filter((m) => m.item_id === a.p_item && m.kind === a.p_kind && m.status !== "failed" && !m.removed_by_admin && m.id !== a.p_replace);
    if (a.p_status !== "failed" && counted.length >= w.limits[a.p_kind as "image" | "video"]) return { data: null, error: { message: "limit_reached:item_media" } };
    if (a.p_media !== a.p_replace && w.tables.item_media.some((m) => m.id === a.p_media)) return { data: null, error: { message: "duplicate key value" } };
    let sort = w.tables.item_media.filter((m) => m.item_id === a.p_item).reduce((n, m) => Math.max(n, m.sort + 1), 0);
    let removed: string[] = [];
    let alt = a.p_alt;
    let variantId = a.p_variant_id;
    if (old) {
      sort = old.sort;
      removed = [old.path, old.poster_path, ...Object.values(old.variants ?? {})].filter(Boolean);
      alt = alt ?? old.alt;
      variantId = variantId ?? old.variant_id;
      w.tables.item_media = w.tables.item_media.filter((m) => m !== old);
    }
    w.tables.item_media.push({
      id: a.p_media, item_id: a.p_item, business_id: item.business_id, kind: a.p_kind, path: a.p_path, mime: a.p_mime, sort,
      width: a.p_width, height: a.p_height, duration_sec: a.p_duration, size_bytes: a.p_size, variants: a.p_variants ?? {},
      poster_path: a.p_poster, poster_time: a.p_poster_time, placeholder: a.p_placeholder, alt, variant_id: variantId,
      status: a.p_status, fail_reason: a.p_fail_reason, removed_by_admin: false,
    });
    return { data: { id: a.p_media, sort, removed }, error: null };
  };

  const rpc = (name: string, args: any) => {
    w.rpc.push({ name, args });
    switch (name) {
      case "hit_rate_limit": {
        const n = (w.counters.get(args.p_key) ?? 0) + 1;
        w.counters.set(args.p_key, n);
        return Promise.resolve({ data: n <= args.p_max, error: null });
      }
      case "attach_item_media": return Promise.resolve(attach(args));
      case "set_media_poster": {
        const row = w.tables.item_media.find((m) => m.id === args.p_media && m.business_id === args.p_business);
        if (!row) return Promise.resolve({ data: null, error: { message: "media_not_found" } });
        if (row.kind !== "video") return Promise.resolve({ data: null, error: { message: "poster_only_video" } });
        const before = row.poster_path;
        row.poster_path = args.p_path;
        row.poster_time = args.p_time;
        if (row.status === "processing") row.status = "ready";
        return Promise.resolve({ data: before, error: null });
      }
      default: return Promise.resolve({ data: null, error: null });
    }
  };

  const list = (prefix: string) => {
    const seen = new Map<string, boolean>();
    for (const p of w.files.keys()) {
      if (!p.startsWith(prefix + "/")) continue;
      const rest = p.slice(prefix.length + 1).split("/");
      seen.set(rest[0], rest.length === 1);
    }
    return Promise.resolve({ data: [...seen].map(([name, file]) => ({ name, id: file ? "x" : null })), error: null });
  };

  const db = {
    from: query, rpc,
    auth: { getUser: (t: string) => Promise.resolve(t === TOKEN ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { message: "bad" } }) },
    storage: {
      from: () => ({
        download: (p: string) => w.files.has(p) ? Promise.resolve({ data: new Blob([w.files.get(p)!]), error: null }) : Promise.resolve({ data: null, error: { message: "nf" } }),
        remove: (ps: string[]) => {
          if (w.failRemove) return Promise.resolve({ error: { message: "boom" } });
          for (const p of ps) { w.removed.push(p); w.files.delete(p); }
          return Promise.resolve({ error: null });
        },
        copy: (from: string, to: string) => {
          if (w.failCopyAt !== null && w.copies.length >= w.failCopyAt) return Promise.resolve({ error: { message: "boom" } });
          if (!w.files.has(from)) return Promise.resolve({ error: { message: "nf" } });
          w.files.set(to, new Uint8Array(w.files.get(from)!));
          w.copies.push([from, to]);
          return Promise.resolve({ error: null });
        },
        list,
      }),
    },
  };
  return { db, anon: {}, salt: "s", code: () => "123456", sms: () => Promise.resolve(true) } as unknown as Deps;
}

const post = (body: unknown, token: string | null = TOKEN) =>
  new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const read = async (r: Response) => ({ status: r.status, body: await r.json() });

const finalize = (w: World) => { const h = sellerMediaFinalize(deps(w)); return async (body: unknown, token: string | null = TOKEN) => read(await h(post(body, token))); };
const remove = (w: World) => { const h = sellerMediaRemove(deps(w)); return async (body: unknown, token: string | null = TOKEN) => read(await h(post(body, token))); };
const copy = (w: World) => { const h = sellerMediaCopy(deps(w)); return async (body: unknown, token: string | null = TOKEN) => read(await h(post(body, token))); };

// Puts a file in the fake bucket and returns its path.
const put = (w: World, path: string, bytes: Uint8Array) => (w.files.set(path, bytes), path);
const photo = (w: World, n: number, item = ITEM, file = "w1600.webp", bytes = webp(1600, 1200)) => put(w, obj(BIZ, item, uid(n), file), bytes);

Deno.test("finalize: needs a seller, and refuses paths that are not this seller's four-level path for this item", async () => {
  const w = world();
  const f = finalize(w);
  const good = photo(w, 1);
  assertEquals((await f({ itemId: ITEM, path: good }, null)).status, 401);
  assertEquals((await f({ itemId: ITEM, path: good }, "bad")).status, 401);
  assertEquals((await f({ itemId: "nope", path: good })).status, 400);
  for (const bad of [
    obj(OTHER_BIZ, ITEM, uid(1)),                  // someone else's business
    obj(BIZ, FOREIGN_ITEM, uid(2)),                // an item that is not the one named
    `${BIZ}/${ITEM}/a.webp`,                       // too shallow
    `${BIZ}/${ITEM}/${uid(3)}/deeper/a.webp`,      // too deep
    `${BIZ}/${ITEM}/${uid(4)}/../../x.webp`,       // traversal
    `${BIZ}/${ITEM}/not-a-uuid/a.webp`,
    `/${BIZ}/${ITEM}/${uid(5)}/a.webp`,
    obj(BIZ, ITEM, uid(6), "a b.webp"),
  ]) {
    put(w, bad, webp(1600, 1200));
    const r = await f({ itemId: ITEM, path: bad });
    assertEquals([r.status, r.body.error], [403, "forbidden"]);
  }
  assertEquals(w.removed, []);   // nothing that was not provably theirs is ever deleted
  assertEquals(w.tables.item_media.length, 0);
});

Deno.test("finalize: an item that is not the seller's is refused and the upload is deleted", async () => {
  const w = world();
  const f = finalize(w);
  const path = put(w, obj(BIZ, FOREIGN_ITEM, uid(1)), webp(1600, 1200));
  // the path names the foreign item, which is not an item of this business: 404 and the file goes
  const r = await f({ itemId: FOREIGN_ITEM, path });
  assertEquals([r.status, r.body.error], [404, "item_not_found"]);
  assertEquals(w.removed, [path]);
  const gone = await f({ itemId: ITEM, path: obj(BIZ, ITEM, uid(9)) });
  assertEquals([gone.status, gone.body.error], [404, "file_not_found"]);
});

Deno.test("finalize: the real type is read from the bytes; disguised files are rejected and deleted", async () => {
  const w = world();
  const f = finalize(w);
  const cases: [string, Uint8Array][] = [
    ["photo.png", disguised.exe()],
    ["photo.webp", disguised.svg()],
    ["photo.jpg", disguised.html()],
    ["photo.webp", disguised.pdf()],
    ["photo.png", disguised.zip()],
    ["photo.webp", disguised.gif()],
    ["clip.mp4", disguised.exe()],
    ["photo.jpg", heic()],            // an iPhone photo is converted in the browser, never stored as is
    ["tiny.webp", new Uint8Array(0)],
  ];
  for (const [i, [file, bytes]] of cases.entries()) {
    const path = put(w, obj(BIZ, ITEM, uid(100 + i), file), bytes);
    // a declared type is ignored: the schema has no field for it, so an attacker's claim changes nothing
    const r = await f({ itemId: ITEM, path, mime: "image/png", type: "image/webp", contentType: "image/jpeg" });
    assertEquals([r.status, r.body.error], [422, "unsupported_type"]);
    assert(w.removed.includes(path), `${file} removed`);
    assert(!w.files.has(path));
  }
  assertEquals(w.tables.item_media.length, 0);
});

Deno.test("finalize: image size rules, then a valid photo is stored with its real type", async () => {
  const w = world();
  const f = finalize(w);
  const run = async (n: number, bytes: Uint8Array) => f({ itemId: ITEM, path: put(w, obj(BIZ, ITEM, uid(n), "main.webp"), bytes) });
  assertEquals((await run(1, png(50, 50))).body.error, "too_small");
  assertEquals((await run(2, png(500, 400))).body.error, "too_small");             // long side under 600
  assertEquals((await run(3, png(199, 900))).body.error, "too_small");             // short side under 200
  assertEquals((await run(4, png(9000, 900))).body.error, "too_big_dimensions");
  assertEquals((await run(5, pad(png(800, 600), 10 * 1024 * 1024 + 1))).body.error, "too_large");
  assertEquals(w.tables.item_media.length, 0);
  assertEquals(w.removed.length, 5);

  const ok = await run(6, jpeg(1600, 1200));
  assertEquals(ok.status, 201);
  assertEquals([ok.body.kind, ok.body.status, ok.body.width, ok.body.height, ok.body.durationSec], ["image", "ready", 1600, 1200, null]);
  assertEquals(w.tables.item_media[0].mime, "image/jpeg");                          // from the bytes, whatever the file name says
  assertEquals((await run(7, png(600, 200))).status, 201);                           // exactly the minimums
});

Deno.test("finalize: variants, placeholder and alt text are kept; a bad variant fails the whole upload and everything is deleted", async () => {
  const w = world();
  const f = finalize(w);
  const media = uid(1);
  const main = put(w, obj(BIZ, ITEM, media, "w1600.webp"), webp(1600, 1200));
  const v320 = put(w, obj(BIZ, ITEM, media, "w320.webp"), webp(320, 240));
  const v640 = put(w, obj(BIZ, ITEM, media, "w640.webp"), webp(640, 480));
  const placeholder = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4";
  const ok = await f({ itemId: ITEM, path: main, variants: { 320: v320, 640: v640, 1600: main }, placeholder, alt: "Red shirt - view 1", variantId: "va" });
  assertEquals(ok.status, 201);
  const row = w.tables.item_media[0];
  assertEquals([row.alt, row.variant_id, row.placeholder, row.variants["320"], row.id], ["Red shirt - view 1", "va", placeholder, v320, media]);
  assertEquals(w.removed, []);

  // a variant that is secretly not an image
  const m2 = uid(2);
  const main2 = put(w, obj(BIZ, ITEM, m2, "w1600.webp"), webp(1600, 1200));
  const evil = put(w, obj(BIZ, ITEM, m2, "w320.webp"), disguised.exe());
  const bad = await f({ itemId: ITEM, path: main2, variants: { 320: evil, 1600: main2 } });
  assertEquals([bad.status, bad.body.error], [422, "unsupported_type"]);
  assert(w.removed.includes(main2) && w.removed.includes(evil));
  assertEquals(w.tables.item_media.length, 1);

  // a variant that points into another item's folder: refused, ours deleted, theirs untouched
  const m3 = uid(3);
  const main3 = put(w, obj(BIZ, ITEM, m3, "w1600.webp"), webp(1600, 1200));
  const theirs = put(w, obj(BIZ, ITEM2, uid(50), "w320.webp"), webp(320, 240));
  const foreign = await f({ itemId: ITEM, path: main3, variants: { 320: theirs, 1600: main3 } });
  assertEquals([foreign.status, foreign.body.error], [403, "forbidden"]);
  assert(w.files.has(theirs) && !w.removed.includes(theirs));
  assert(w.removed.includes(main3));

  // malformed extras are rejected before anything is read
  assertEquals((await f({ itemId: ITEM, path: main3, placeholder: "javascript:alert(1)" })).status, 400);
  assertEquals((await f({ itemId: ITEM, path: main3, alt: "x".repeat(121) })).status, 400);
  assertEquals((await f({ itemId: ITEM, path: main3, variants: { "abc": main3 } })).status, 400);
  const unknownVariant = await f({ itemId: ITEM, path: put(w, obj(BIZ, ITEM, uid(4), "a.webp"), webp(800, 600)), variantId: "ghost" });
  assertEquals([unknownVariant.status, unknownVariant.body.error], [422, "variant_not_found"]);
});

Deno.test("finalize: limits are checked in the database call and a refused upload is deleted", async () => {
  const w = world();
  const f = finalize(w);
  for (let i = 0; i < 7; i++) assertEquals((await f({ itemId: ITEM, path: photo(w, i + 1) })).status, 201);
  const extra = photo(w, 8);
  const extraVariant = put(w, obj(BIZ, ITEM, uid(8), "w320.webp"), webp(320, 240));
  const full = await f({ itemId: ITEM, path: extra, variants: { 320: extraVariant, 1600: extra } });
  assertEquals([full.status, full.body.error], [409, "limit_reached"]);
  assert(w.removed.includes(extra) && w.removed.includes(extraVariant));
  assertEquals(w.tables.item_media.length, 7);
  // the same call decides, so two uploads racing for the last slot cannot both win
  assertEquals(w.rpc.filter((c) => c.name === "attach_item_media").length, 8);

  // a database failure also deletes the upload and answers with a generic error
  const w2 = world();
  const f2 = finalize(w2);
  const orig = w2.tables.items[0];
  w2.tables.items[0] = { ...orig, variants: [] };
  const p = photo(w2, 1);
  const r = await f2({ itemId: ITEM, path: p, variantId: "ghost" });
  assertEquals(r.status, 422);
  assert(w2.removed.includes(p));
});

Deno.test("finalize: videos are limited to 45 seconds and 25 MB; the codec decides whether shoppers can ever see it", async () => {
  const w = world();
  w.limits.video = 10;
  const f = finalize(w);
  const run = async (n: number, bytes: Uint8Array, extra: Record<string, unknown> = {}) => {
    const path = put(w, obj(BIZ, ITEM, uid(n), "video.mp4"), bytes);
    const poster = put(w, obj(BIZ, ITEM, uid(n), "poster.webp"), webp(960, 540));
    return { ...(await f({ itemId: ITEM, path, poster, posterTimeSec: 1, ...extra })), path, poster };
  };
  const sixty = await run(1, mp4(1280, 720, 60));
  assertEquals([sixty.status, sixty.body.error], [422, "too_long"]);
  assert(w.removed.includes(sixty.path) && w.removed.includes(sixty.poster));
  assertEquals((await run(2, mp4(1280, 720, 46))).body.error, "too_long");
  const edge = await run(3, mp4(1280, 720, 45));
  assertEquals([edge.status, edge.body.status], [201, "ready"]);
  const big = await run(4, pad(mp4(1280, 720, 10), 25 * 1024 * 1024 + 1));
  assertEquals(big.body.error, "too_large");
  assertEquals((await run(5, disguised.exe())).body.error, "unsupported_type");

  const good = await run(6, mp4(1280, 720, 12));
  assertEquals([good.status, good.body.kind, good.body.status, good.body.durationSec, good.body.width, good.body.codec], [201, "video", "ready", 12, 1280, "h264"]);
  assertEquals(w.tables.item_media.find((m) => m.id === uid(6))!.poster_path, obj(BIZ, ITEM, uid(6), "poster.webp"));

  const web = await run(7, webm(854, 480, 7));
  assertEquals([web.status, web.body.status], [201, "ready"]);
  const qt = await run(8, mov(1280, 720, 9));
  assertEquals([qt.status, qt.body.kind], [201, "video"]);
  assertEquals(w.tables.item_media.find((m) => m.id === uid(8))!.mime, "video/quicktime");

  // an iPhone HEVC clip is kept, marked failed with a reason, and never shown to shoppers
  const hevc = await run(9, mp4(1280, 720, 8, { codec: "hevc" }));
  assertEquals([hevc.status, hevc.body.status, hevc.body.failReason], [201, "failed", "unsupported_codec"]);
  assert(!w.removed.includes(hevc.path));

  // without a poster the video waits as "processing" until one is set
  const noPoster = put(w, obj(BIZ, ITEM, uid(10), "video.mp4"), mp4(1280, 720, 5));
  const waiting = await f({ itemId: ITEM, path: noPoster });
  assertEquals([waiting.status, waiting.body.status], [201, "processing"]);

  // a poster on a photo is refused
  const img = photo(w, 11);
  const posterOnImage = put(w, obj(BIZ, ITEM, uid(11), "poster.webp"), webp(960, 540));
  assertEquals((await f({ itemId: ITEM, path: img, poster: posterOnImage })).body.error, "poster_only_video");
});

Deno.test("finalize: replacing a media keeps its place and deletes the old files; a failed replacement deletes the new ones", async () => {
  const w = world();
  const f = finalize(w);
  const first = photo(w, 1);
  photo(w, 2);
  await f({ itemId: ITEM, path: first, alt: "First", variantId: "vb" });
  const oldVariant = obj(BIZ, ITEM, uid(1), "w320.webp");
  w.tables.item_media[0].variants = { 320: oldVariant };
  put(w, oldVariant, webp(320, 240));
  const replacement = photo(w, 3);
  const done = await f({ itemId: ITEM, path: replacement, replaceMediaId: uid(1) });
  assertEquals([done.status, done.body.id, done.body.sort], [201, uid(3), 0]);
  assert(w.removed.includes(first) && w.removed.includes(oldVariant));
  const row = w.tables.item_media.find((m) => m.id === uid(3))!;
  assertEquals([row.alt, row.variant_id], ["First", "vb"]);

  // The browser replaces in place: same media id, new file names inside the same folder. The old files go, the new stay.
  const inPlace = obj(BIZ, ITEM, uid(3), "w1600-fresh.webp");
  put(w, inPlace, webp(1600, 1200));
  const same = await f({ itemId: ITEM, path: inPlace, replaceMediaId: uid(3) });
  assertEquals([same.status, same.body.id], [201, uid(3)]);
  assert(w.removed.includes(replacement) && !w.removed.includes(inPlace));
  assertEquals(w.tables.item_media.filter((m) => m.id === uid(3)).length, 1);
  const missing = photo(w, 4);
  const lost = await f({ itemId: ITEM, path: missing, replaceMediaId: uid(77) });
  assertEquals([lost.status, lost.body.error], [404, "media_not_found"]);
  assert(w.removed.includes(missing));

  w.tables.item_media.find((m) => m.id === uid(3))!.removed_by_admin = true;
  const removedPhoto = photo(w, 5);
  const blocked = await f({ itemId: ITEM, path: removedPhoto, replaceMediaId: uid(3) });
  assertEquals([blocked.status, blocked.body.error], [409, "removed_by_admin"]);
  assert(w.removed.includes(removedPhoto));
  assert(!w.removed.slice(-1).includes(replacement));
});

Deno.test("finalize: a new poster replaces the old one, only on a video of this seller, and only if it is a real image", async () => {
  const w = world();
  const f = finalize(w);
  const video = put(w, obj(BIZ, ITEM, uid(1), "video.mp4"), mp4(1280, 720, 12));
  const first = put(w, obj(BIZ, ITEM, uid(1), "poster-1.webp"), webp(960, 540));
  await f({ itemId: ITEM, path: video, poster: first, posterTimeSec: 1 });
  const second = put(w, obj(BIZ, ITEM, uid(1), "poster-2.webp"), webp(960, 540));
  const ok = await f({ action: "poster", itemId: ITEM, mediaId: uid(1), path: second, timeSec: 4.5 });
  assertEquals([ok.status, ok.body.poster], [200, second]);
  assert(w.removed.includes(first) && !w.removed.includes(second));
  assertEquals([w.tables.item_media[0].poster_path, w.tables.item_media[0].poster_time], [second, 4.5]);

  const fake = put(w, obj(BIZ, ITEM, uid(1), "poster-3.webp"), disguised.svg());
  const bad = await f({ action: "poster", itemId: ITEM, mediaId: uid(1), path: fake });
  assertEquals([bad.status, bad.body.error], [422, "unsupported_type"]);
  assert(w.removed.includes(fake));
  assertEquals(w.tables.item_media[0].poster_path, second);

  const wrongFolder = put(w, obj(BIZ, ITEM2, uid(1), "poster-4.webp"), webp(960, 540));
  assertEquals((await f({ action: "poster", itemId: ITEM, mediaId: uid(1), path: wrongFolder })).status, 403);
  assert(!w.removed.includes(wrongFolder));

  const image = photo(w, 2);
  await f({ itemId: ITEM, path: image });
  const onImage = put(w, obj(BIZ, ITEM, uid(2), "poster.webp"), webp(960, 540));
  assertEquals((await f({ action: "poster", itemId: ITEM, mediaId: uid(2), path: onImage })).body.error, "poster_only_video");

  const unknown = put(w, obj(BIZ, ITEM, uid(99), "poster.webp"), webp(960, 540));
  assertEquals((await f({ action: "poster", itemId: ITEM, mediaId: uid(99), path: unknown })).status, 404);

  // a video that was waiting for a poster becomes ready
  const lonely = put(w, obj(BIZ, ITEM, uid(3), "video.mp4"), mp4(1280, 720, 5));
  w.limits.video = 5;
  assertEquals((await f({ itemId: ITEM, path: lonely })).body.status, "processing");
  const late = put(w, obj(BIZ, ITEM, uid(3), "poster.webp"), webp(960, 540));
  assertEquals((await f({ action: "poster", itemId: ITEM, mediaId: uid(3), path: late })).status, 200);
  assertEquals(w.tables.item_media.find((m) => m.id === uid(3))!.status, "ready");
});

Deno.test("finalize: uploads are rate limited", async () => {
  const w = world();
  const f = finalize(w);
  for (let i = 0; i < 120; i++) await f({ itemId: ITEM, path: obj(BIZ, ITEM, uid(1000 + i)) });
  assertEquals((await f({ itemId: ITEM, path: obj(BIZ, ITEM, uid(9999)) })).status, 429);
});

Deno.test("remove: one media takes its files and strays with it; other sellers' media is out of reach", async () => {
  const w = world();
  const f = finalize(w);
  const main = photo(w, 1);
  const v320 = put(w, obj(BIZ, ITEM, uid(1), "w320.webp"), webp(320, 240));
  await f({ itemId: ITEM, path: main, variants: { 320: v320, 1600: main } });
  const stray = put(w, obj(BIZ, ITEM, uid(1), "stray.webp"), webp(320, 240));
  const sibling = photo(w, 2);
  await f({ itemId: ITEM, path: sibling });
  const theirs = put(w, obj(OTHER_BIZ, FOREIGN_ITEM, uid(60)), webp(1600, 1200));
  w.tables.item_media.push({ id: uid(60), item_id: FOREIGN_ITEM, business_id: OTHER_BIZ, path: theirs, variants: {} });
  const r = remove(w);

  assertEquals((await r({ mediaId: uid(1) }, null)).status, 401);
  assertEquals((await r({})).status, 400);
  const gone = await r({ mediaId: uid(60) });
  assertEquals([gone.status, gone.body.error], [404, "media_not_found"]);
  assert(w.files.has(theirs));

  const ok = await r({ mediaId: uid(1) });
  assertEquals([ok.status, ok.body.removed], [200, 1]);
  for (const p of [main, v320, stray]) assert(!w.files.has(p), p);
  assert(w.files.has(sibling));
  assertEquals(w.tables.item_media.map((m) => m.id).sort(), [uid(2), uid(60)].sort());
  assertEquals((await r({ mediaId: uid(1) })).status, 404);
});

Deno.test("remove: a storage failure keeps the row so a retry can finish; deleting an item removes every media and file", async () => {
  const w = world();
  const f = finalize(w);
  for (let i = 1; i <= 3; i++) await f({ itemId: ITEM, path: photo(w, i) });
  const keep = photo(w, 9, ITEM2);
  await f({ itemId: ITEM2, path: keep });
  const stray = put(w, obj(BIZ, ITEM, uid(40), "left-behind.webp"), webp(320, 240));
  const r = remove(w);

  w.failRemove = true;
  const failed = await r({ itemId: ITEM });
  assertEquals([failed.status, failed.body.error], [500, "storage_failed"]);
  assertEquals(w.tables.item_media.filter((m) => m.item_id === ITEM).length, 3);
  w.failRemove = false;

  const ok = await r({ itemId: ITEM });
  assertEquals([ok.status, ok.body.removed], [200, 3]);
  assertEquals([...w.files.keys()].filter((p) => p.includes(`/${ITEM}/`)), []);
  assert(!w.files.has(stray));
  assertEquals(w.tables.item_media.map((m) => m.item_id), [ITEM2]);       // the other item is untouched
  assert(w.files.has(keep));
  assertEquals((await r({ itemId: FOREIGN_ITEM })).status, 404);
});

Deno.test("copy: a duplicate gets new files and new rows; nothing is shared with the original", async () => {
  const w = world();
  const f = finalize(w);
  const media = uid(1);
  const main = photo(w, 1);
  const v320 = put(w, obj(BIZ, ITEM, media, "w320.webp"), webp(320, 240));
  await f({ itemId: ITEM, path: main, variants: { 320: v320, 1600: main }, alt: "Red", variantId: "vb", placeholder: "data:image/webp;base64,AAAA" });
  const video = put(w, obj(BIZ, ITEM, uid(2), "video.mp4"), mp4(1280, 720, 12));
  const poster = put(w, obj(BIZ, ITEM, uid(2), "poster.webp"), webp(960, 540));
  await f({ itemId: ITEM, path: video, poster, posterTimeSec: 1 });
  const failedClip = put(w, obj(BIZ, ITEM, uid(3), "video.mp4"), mp4(1280, 720, 8, { codec: "hevc" }));
  await f({ itemId: ITEM, path: failedClip });
  w.limits.image = 8;
  const removedPhoto = photo(w, 4);
  await f({ itemId: ITEM, path: removedPhoto });
  w.tables.item_media.find((m) => m.id === uid(4))!.removed_by_admin = true;

  const c = copy(w);
  assertEquals((await c({ fromItemId: ITEM, toItemId: ITEM2 }, null)).status, 401);
  assertEquals((await c({ fromItemId: ITEM, toItemId: ITEM })).status, 400);
  assertEquals((await c({ fromItemId: ITEM, toItemId: FOREIGN_ITEM })).status, 404);
  assertEquals((await c({ fromItemId: FOREIGN_ITEM, toItemId: ITEM2 })).status, 404);

  const ok = await c({ fromItemId: ITEM, toItemId: ITEM2 });
  assertEquals([ok.status, ok.body.copied], [201, 2]);        // the failed clip and the admin-removed photo stay behind
  const mine = w.tables.item_media.filter((m) => m.item_id === ITEM2).sort((a, b) => a.sort - b.sort);
  assertEquals(mine.map((m) => m.kind), ["image", "video"]);
  assert(mine.every((m) => !w.tables.item_media.some((o) => o.item_id === ITEM && o.id === m.id)), "new ids");
  for (const m of mine) {
    for (const p of [m.path, m.poster_path, ...Object.values(m.variants)].filter(Boolean) as string[]) {
      assert(p.startsWith(`${BIZ}/${ITEM2}/${m.id}/`), p);
      assert(w.files.has(p), `${p} exists`);
    }
  }
  assertEquals([mine[0].alt, mine[0].variant_id, mine[0].placeholder], ["Red", "nb", "data:image/webp;base64,AAAA"]);   // variant mapped by position
  // the originals are untouched, and removing the copy leaves them whole
  assert(w.files.has(main) && w.files.has(v320) && w.files.has(video) && w.files.has(poster));
  const r = remove(w);
  await r({ itemId: ITEM2 });
  assert(w.files.has(main) && w.files.has(v320) && w.files.has(poster));
  assertEquals(w.tables.item_media.filter((m) => m.item_id === ITEM).length, 4);

  // copying again into an item that already has media is refused
  await c({ fromItemId: ITEM, toItemId: ITEM2 });
  const again = await c({ fromItemId: ITEM, toItemId: ITEM2 });
  assertEquals([again.status, again.body.error], [409, "target_not_empty"]);
});

Deno.test("copy: a failure part way leaves nothing behind", async () => {
  const w = world();
  const f = finalize(w);
  for (let i = 1; i <= 3; i++) {
    const main = photo(w, i);
    const v = put(w, obj(BIZ, ITEM, uid(i), "w320.webp"), webp(320, 240));
    await f({ itemId: ITEM, path: main, variants: { 320: v, 1600: main } });
  }
  const before = new Set(w.files.keys());
  w.failCopyAt = 3;
  const r = await copy(w)({ fromItemId: ITEM, toItemId: ITEM2 });
  assertEquals([r.status, r.body.error], [500, "storage_failed"]);
  assertEquals(w.tables.item_media.filter((m) => m.item_id === ITEM2).length, 0);
  assertEquals(new Set(w.files.keys()), before);

  // the target plan is full: the copies already made are removed again
  const w2 = world();
  const f2 = finalize(w2);
  for (let i = 1; i <= 3; i++) await f2({ itemId: ITEM, path: photo(w2, i) });
  w2.limits.image = 2;
  const snapshot = new Set(w2.files.keys());
  const full = await copy(w2)({ fromItemId: ITEM, toItemId: ITEM2 });
  assertEquals([full.status, full.body.error], [409, "limit_reached"]);
  assertEquals(w2.tables.item_media.filter((m) => m.item_id === ITEM2).length, 0);
  assertEquals(new Set(w2.files.keys()), snapshot);
});
