import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyUrl, migrateImages, toCloudinaryId, uploadFromUrl } from "./lib/migrate-images.mjs";
import { signParams } from "../shared/src/seller/cloudinarySign.js";

const B = "10000000-0000-4000-8000-0000000000a1";
const I = "20000000-0000-4000-8000-0000000000c1";
const U = (n) => `30000000-0000-4000-8000-00000000000${n}`;
const cloud = { cloudName: "demo", apiKey: "k", apiSecret: "s", aiUpscale: false };

test("only legacy image paths convert, by dropping the extension", () => {
  assert.equal(toCloudinaryId(`${B}/${I}/${U(1)}.jpg`), `${B}/${I}/${U(1)}`);
  assert.equal(toCloudinaryId(`${B}/profile/logo-${U(1)}.WEBP`), `${B}/profile/logo-${U(1)}`);
  for (const v of [`${B}/${I}/${U(1)}.mp4`, `${B}/${I}/${U(1)}`, `${B}/../x/y.jpg`, null, "", "x.jpg.exe"]) assert.equal(toCloudinaryId(v), null, String(v));
});

test("the legacy url points at the public bucket", () => {
  assert.equal(legacyUrl("https://p.supabase.co/", `${B}/a b.jpg`), `https://p.supabase.co/storage/v1/object/public/seller-media/${B}/a%20b.jpg`);
});

const cloudFetch = (log, { fail = false } = {}) => async (url, init) => {
  const body = Object.fromEntries(init.body);
  log.push(body);
  if (fail) return new Response(JSON.stringify({ error: { message: "nope" } }), { status: 400 });
  const version = 1700000000;
  const signature = await signParams({ public_id: body.public_id, version }, "s", "sha1");
  return new Response(JSON.stringify({ public_id: body.public_id, version, signature, width: 3840, height: 2160, bytes: 500000 }), { status: 200 });
};

test("uploadFromUrl signs the request, fetches from the url, and verifies Cloudinary's answer", async () => {
  const log = [];
  const r = await uploadFromUrl({ cloud, url: "https://x/y.jpg", publicId: `${B}/${I}/${U(1)}`, doFetch: cloudFetch(log), now: () => 1_700_000_000_000 });
  assert.equal(r.width, 3840);
  assert.equal(log[0].file, "https://x/y.jpg");
  assert.equal(log[0].transformation, "c_fit,w_3840,h_3840/q_auto:best");
  const { file, api_key, signature, ...signed } = log[0];
  assert.equal(signature, await signParams(signed, "s"));
  await assert.rejects(uploadFromUrl({ cloud, url: "u", publicId: "a/b", doFetch: cloudFetch([], { fail: true }) }), /nope/);
  const forged = async () => new Response(JSON.stringify({ public_id: "a/b", version: 1, signature: "0".repeat(40) }), { status: 200 });
  await assert.rejects(uploadFromUrl({ cloud, url: "u", publicId: "a/b", doFetch: forged }), /bad_response_signature/);
});

// A tiny fake of the supabase-js calls the migration makes.
function fakeDb({ media, businesses = [] }) {
  const calls = { removed: [], gc: [] };
  const table = (name) => {
    const rows = name === "item_media" ? media : businesses;
    const q = { f: [], gtId: null, patch: null, lim: Infinity };
    const api = {
      select: () => api, order: () => api,
      eq: (c, v) => (q.f.push((r) => r[c] === v), api),
      gt: (_c, v) => ((q.gtId = v), api),
      not: (c) => (q.f.push((r) => r[c] != null), api),
      limit: (n) => ((q.lim = n), api),
      update: (p) => ((q.patch = p), api),
      then: (res, rej) => {
        let hit = rows.filter((r) => q.f.every((f) => f(r)) && (!q.gtId || r.id > q.gtId)).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, q.lim);
        if (q.patch) hit.forEach((r) => Object.assign(r, q.patch));
        return Promise.resolve({ data: hit.map((r) => ({ ...r })), error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { calls, from: table, rpc: (n, a) => (calls.gc.push([n, a]), Promise.resolve({ error: null })), storage: { from: () => ({ remove: (p) => (calls.removed.push(...p), Promise.resolve({})) }) } };
}

test("migrates photos and shop images, skips videos and converted rows, and is safe to run again", async () => {
  const media = [
    { id: "00000000-0000-4000-8000-000000000001", kind: "image", path: `${B}/${I}/${U(1)}.jpg` },
    { id: "00000000-0000-4000-8000-000000000002", kind: "image", path: `${B}/${I}/${U(2)}` },
    { id: "00000000-0000-4000-8000-000000000003", kind: "video", path: `${B}/${I}/${U(3)}.mp4` },
  ];
  const businesses = [{ id: B, logo_path: `${B}/profile/logo-${U(4)}.png`, cover_path: null }];
  const db = fakeDb({ media, businesses });
  const log = [];
  const stats = await migrateImages({ db, cloud, supabaseUrl: "https://p.supabase.co", log: () => {}, doFetch: cloudFetch(log) });
  assert.deepEqual(stats, { converted: 2, failed: 0, skipped: 1, vanished: 0 });
  assert.equal(media[0].path, `${B}/${I}/${U(1)}`);
  assert.equal(media[0].width, 3840);
  assert.equal(media[2].path, `${B}/${I}/${U(3)}.mp4`, "videos stay in Supabase");
  assert.equal(businesses[0].logo_path, `${B}/profile/logo-${U(4)}`);
  assert.deepEqual(db.calls.removed, [], "nothing deleted by default");
  const again = await migrateImages({ db, cloud, supabaseUrl: "https://p.supabase.co", log: () => {}, doFetch: cloudFetch([]) });
  assert.equal(again.converted, 0);
});

test("dry run changes nothing, limit stops early, failures leave the row alone, deleteOld removes the old file", async () => {
  const mk = () => [1, 2, 3].map((n) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, kind: "image", path: `${B}/${I}/${U(n)}.jpg` }));
  let media = mk();
  let s = await migrateImages({ db: fakeDb({ media }), cloud, supabaseUrl: "https://p", dryRun: true, log: () => {}, doFetch: () => assert.fail("no network in a dry run") });
  assert.equal(s.converted, 3);
  assert.ok(media.every((m) => m.path.endsWith(".jpg")));

  media = mk();
  s = await migrateImages({ db: fakeDb({ media }), cloud, supabaseUrl: "https://p", limit: 2, log: () => {}, doFetch: cloudFetch([]) });
  assert.equal(s.converted, 2);
  assert.equal(media.filter((m) => m.path.endsWith(".jpg")).length, 1);

  media = mk();
  s = await migrateImages({ db: fakeDb({ media }), cloud, supabaseUrl: "https://p", log: () => {}, doFetch: cloudFetch([], { fail: true }) });
  assert.equal(s.failed, 3);
  assert.ok(media.every((m) => m.path.endsWith(".jpg")));

  media = mk().slice(0, 1);
  const db = fakeDb({ media });
  await migrateImages({ db, cloud, supabaseUrl: "https://p", deleteOld: true, log: () => {}, doFetch: cloudFetch([]) });
  assert.deepEqual(db.calls.removed, [`${B}/${I}/${U(1)}.jpg`]);
});
