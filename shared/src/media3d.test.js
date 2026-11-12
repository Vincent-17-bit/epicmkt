import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIA3D, TICKET_KINDS, KIND_OF_ROLE, ROLE_OF_KIND, MEDIA_ROLES, normalizeType, checkTicketRequest, checkOptionIds, inspectGlb, buildView3d, hasView3d, view3dIssues, resolveView3d, resolveMedia3d } from "./media3d.js";

const le32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
// A real, minimal glTF 2 binary: header, one JSON chunk (space padded to 4 bytes), optional BIN chunk.
function glb(doc = { asset: { version: "2.0" } }, { bin = 0, version = 2, lengthDelta = 0, magic = [0x67, 0x6c, 0x54, 0x46], chunk = [0x4a, 0x53, 0x4f, 0x4e], text } = {}) {
  let json = [...new TextEncoder().encode(text ?? JSON.stringify(doc))];
  while (json.length % 4) json.push(0x20);
  const binChunk = bin ? [...le32(bin), 0x42, 0x49, 0x4e, 0, ...new Array(bin).fill(0)] : [];
  const total = 12 + 8 + json.length + binChunk.length;
  return Uint8Array.from([...magic, ...le32(version), ...le32(total + lengthDelta), ...le32(json.length), ...chunk, ...json, ...binChunk]);
}

test("limits: a spin is 12 to 72 frames and at most 160 tickets may be open per item", () => {
  assert.deepEqual([MEDIA3D.spinMinFrames, MEDIA3D.spinMaxFrames, MEDIA3D.maxPendingTickets], [12, 72, 160]);
});

test("roles and kinds map one to one", () => {
  assert.deepEqual(MEDIA_ROLES, ["image", "video", "spin-frame", "model-glb", "poster"]);
  for (const role of MEDIA_ROLES) assert.equal(ROLE_OF_KIND[KIND_OF_ROLE[role]], role);
  assert.equal(KIND_OF_ROLE["model-glb"], "model");
});

test("normalizeType accepts extensions and the media types we know, nothing vague", () => {
  assert.equal(normalizeType("JPEG"), "jpg");
  assert.equal(normalizeType(".glb"), "glb");
  assert.equal(normalizeType("model/gltf-binary"), "glb");
  assert.equal(normalizeType("image/webp"), "webp");
  assert.equal(normalizeType("application/octet-stream"), null);
  assert.equal(normalizeType(""), null);
  assert.equal(normalizeType(7), null);
  assert.equal(normalizeType("../etc"), null);
});

test("ticket limits: glb up to 15 MB, pictures 10 MB, size is required for 3D kinds", () => {
  assert.equal(MEDIA3D.modelMaxBytes, 15 * 1024 * 1024);
  assert.equal(checkTicketRequest({ kind: "model-glb", type: "glb", size: MEDIA3D.modelMaxBytes }).ok, true);
  assert.deepEqual(checkTicketRequest({ kind: "model-glb", type: "glb", size: MEDIA3D.modelMaxBytes + 1 }), { ok: false, error: "too_large", maxBytes: MEDIA3D.modelMaxBytes });
  assert.equal(checkTicketRequest({ kind: "spin-frame", type: "jpg", size: MEDIA3D.imageMaxBytes + 1 }).error, "too_large");
  assert.equal(checkTicketRequest({ kind: "poster", type: "png" }).error, "bad_size");
  assert.equal(checkTicketRequest({ kind: "poster", type: "png", size: 0 }).error, "bad_size");
  assert.equal(checkTicketRequest({ kind: "poster", type: "png", size: 1.5 }).error, "bad_size");
  assert.equal(checkTicketRequest({ kind: "poster", type: "png", size: "10" }).error, "bad_size");
  assert.equal(TICKET_KINDS["spin-frame"].maxCount, 72);
});

test("ticket types: a model is glb only, pictures are jpg/png/webp, video mp4/webm", () => {
  assert.equal(checkTicketRequest({ kind: "model-glb", type: "gltf", size: 10 }).error, "unsupported_type");
  assert.equal(checkTicketRequest({ kind: "model-glb", type: "png", size: 10 }).error, "unsupported_type");
  assert.equal(checkTicketRequest({ kind: "poster", type: "glb", size: 10 }).error, "unsupported_type");
  assert.equal(checkTicketRequest({ kind: "spin-frame", type: "gif", size: 10 }).error, "unsupported_type");
  assert.equal(checkTicketRequest({ kind: "video", type: "webm" }).ok, true);
  assert.equal(checkTicketRequest({ kind: "video", type: "mp4", size: 26 * 1024 * 1024 }).error, "too_large");
  assert.equal(checkTicketRequest({ kind: "image", type: "jpeg" }).ok, true);
  assert.equal(checkTicketRequest({ kind: "toString", type: "jpg", size: 1 }).error, "unsupported_kind");
  assert.equal(checkTicketRequest({ kind: "nope", type: "jpg", size: 1 }).error, "unsupported_kind");
  assert.equal(checkTicketRequest().error, "unsupported_kind");
});

test("option ids: 3D assets take at most one, photos many, bad ids and duplicates refused", () => {
  assert.deepEqual(checkOptionIds("image", ["grey", "black"]), { ok: true, ids: ["grey", "black"] });
  assert.deepEqual(checkOptionIds("model-glb", undefined), { ok: true, ids: [] });
  assert.deepEqual(checkOptionIds("model-glb", ["grey"]), { ok: true, ids: ["grey"] });
  assert.equal(checkOptionIds("model-glb", ["grey", "black"]).error, "one_option_only");
  assert.equal(checkOptionIds("spin-frame", ["a", "b"]).error, "one_option_only");
  assert.equal(checkOptionIds("image", ["grey", "grey"]).error, "bad_option_ids");
  assert.equal(checkOptionIds("image", ["Grey"]).error, "bad_option_ids");
  assert.equal(checkOptionIds("image", "grey").error, "bad_option_ids");
  assert.equal(checkOptionIds("image", [1]).error, "bad_option_ids");
  assert.equal(checkOptionIds("image", Array.from({ length: 41 }, (_, i) => `v${i}`)).error, "bad_option_ids");
  assert.equal(checkOptionIds("gif", ["a"]).error, "unsupported_kind");
});

test("inspectGlb accepts a real glb and reads its size", () => {
  const f = glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 8 }], images: [{ uri: "data:image/png;base64,AAAA" }] }, { bin: 8 });
  assert.deepEqual(inspectGlb(f), { ok: true, size: f.length, mime: "model/gltf-binary" });
});

test("inspectGlb refuses wrong type, too large, corrupt and external references", () => {
  assert.equal(inspectGlb(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, ...new Array(40).fill(0)])).reason, "unsupported_type");   // a png renamed .glb
  assert.equal(inspectGlb(new Uint8Array(5)).reason, "unsupported_type");
  assert.equal(inspectGlb("glTF").reason, "unsupported_type");
  assert.equal(inspectGlb(glb(undefined, { version: 1 })).reason, "unsupported_type");
  assert.equal(inspectGlb(glb(), { maxBytes: 10 }).reason, "too_large");
  assert.equal(inspectGlb(glb(undefined, { lengthDelta: 4 })).reason, "corrupt");
  assert.equal(inspectGlb(glb(undefined, { chunk: [0x42, 0x49, 0x4e, 0] })).reason, "corrupt");
  assert.equal(inspectGlb(glb(undefined, { text: "{not json" })).reason, "corrupt");
  assert.equal(inspectGlb(glb({ asset: { version: "1.0" } })).reason, "corrupt");
  assert.equal(inspectGlb(glb({})).reason, "corrupt");
  assert.equal(inspectGlb(glb({ asset: { version: "2.0" }, images: [{ uri: "https://tracker.example/x.png" }] })).reason, "external_resources");
  assert.equal(inspectGlb(glb({ asset: { version: "2.0" }, buffers: [{ uri: "model.bin" }] })).reason, "external_resources");
  assert.equal(inspectGlb(glb({ asset: { version: "2.0" }, buffers: "x" })).reason, "corrupt");
});

const frame = (n, extra = {}) => ({ id: `f${String(n).padStart(3, "0")}`, role: "spin-frame", path: `frame-${n}`, sort: n, optionIds: [], ...extra });
const frames = (count, extra) => Array.from({ length: count }, (_, i) => frame(i, extra));
const poster = (extra = {}) => ({ id: "p1", role: "poster", path: "poster-1", sort: 0, optionIds: [], ...extra });
const model = (extra = {}) => ({ id: "m1", role: "model-glb", path: "model-1", size: 1234, sort: 0, optionIds: [], ...extra });

test("buildView3d: a model with a poster, a spin with a poster, or both", () => {
  assert.deepEqual(buildView3d([model(), poster()]), { view3d: { model: { path: "model-1", size: 1234 }, poster: "poster-1" }, view3dByOption: {} });
  const s = buildView3d([...frames(24), poster()]);
  assert.equal(s.view3d.spin.count, 24);
  assert.equal(s.view3d.spin.frames[0], "frame-0");
  assert.equal(s.view3d.model, undefined);
  const both = buildView3d([model(), poster(), ...frames(12)]);
  assert.ok(both.view3d.model && both.view3d.spin);
});

test("buildView3d: no poster means no view, and the issue says so", () => {
  const rows = [model(), ...frames(24)];
  assert.deepEqual(buildView3d(rows), { view3d: null, view3dByOption: {} });
  assert.equal(hasView3d(rows), false);
  assert.deepEqual(view3dIssues(rows), [{ code: "view3d_missing_poster", scope: null }]);
  assert.deepEqual(view3dIssues([poster()]), []);
  assert.deepEqual(view3dIssues([]), []);
  assert.deepEqual(view3dIssues(undefined), []);
});

test("spin frame count limits: 12 to 72 shows, outside is left out and reported", () => {
  assert.equal(hasView3d([...frames(11), poster()]), false);
  assert.deepEqual(view3dIssues([...frames(11), poster()]), [{ code: "spin_too_few_frames", scope: null }]);
  assert.equal(hasView3d([...frames(12), poster()]), true);
  assert.equal(hasView3d([...frames(72), poster()]), true);
  assert.equal(hasView3d([...frames(73), poster()]), false);
  assert.deepEqual(view3dIssues([...frames(73), poster()]), [{ code: "spin_too_many_frames", scope: null }]);
  // a bad spin does not hide a good model in the same scope
  const v = buildView3d([model(), poster(), ...frames(5)]);
  assert.ok(v.view3d.model);
  assert.equal(v.view3d.spin, undefined);
});

test("frames follow sort, then creation time, then id", () => {
  const rows = [frame(1, { sort: 5 }), frame(2, { sort: 1 }), frame(3, { sort: 1, createdAt: "2026-01-02" }), frame(4, { sort: 1, createdAt: "2026-01-01" }), ...frames(8, { sort: 9, id: undefined })];
  const spin = buildView3d([...rows, poster()]).view3d.spin.frames;
  assert.deepEqual(spin.slice(0, 4), ["frame-2", "frame-4", "frame-3", "frame-1"]);
});

test("per option 3D: each value has its own view; item level and values are independent", () => {
  const rows = [model(), poster(), model({ id: "m2", path: "model-grey", optionIds: ["grey"] }), poster({ id: "p2", path: "poster-grey", optionIds: ["grey"] }), model({ id: "m3", path: "model-red", optionIds: ["red"] })];
  const v = buildView3d(rows);
  assert.equal(v.view3d.model.path, "model-1");
  assert.deepEqual(Object.keys(v.view3dByOption), ["grey"]);
  assert.equal(v.view3dByOption.grey.poster, "poster-grey");
  assert.deepEqual(view3dIssues(rows), [{ code: "view3d_missing_poster", scope: "red" }]);
  assert.equal(hasView3d([model({ optionIds: ["red"] }), poster({ optionIds: ["red"] })]), true);
  assert.deepEqual(buildView3d([model({ optionIds: ["red"] }), poster({ optionIds: ["red"] })]).view3d, null);
});

test("photos and videos are not 3D and never create a view", () => {
  const rows = [{ role: "image", path: "a", optionIds: [] }, { role: "video", path: "b" }, null, undefined];
  assert.deepEqual(buildView3d(rows), { view3d: null, view3dByOption: {} });
  assert.deepEqual(view3dIssues(rows), []);
});

test("resolveView3d gives the Contract v1 shape with urls", () => {
  const urlFor = (p, role) => `https://cdn/${role}/${p}`;
  const raw = buildView3d([model(), poster(), ...frames(12)]);
  const v = resolveView3d(raw.view3d, urlFor);
  assert.equal(v.model.url, "https://cdn/model-glb/model-1");
  assert.equal(v.model.size, 1234);
  assert.equal(v.spin.count, 12);
  assert.equal(v.spin.frames[0], "https://cdn/spin-frame/frame-0");
  assert.equal(v.poster, "https://cdn/poster/poster-1");
  assert.equal(resolveView3d(null, urlFor), null);
  assert.equal(resolveView3d({ model: { path: "x", size: 1 } }, urlFor), null);   // never without a poster
  const all = resolveMedia3d({ view3d: raw.view3d, view3dByOption: { grey: raw.view3d } }, urlFor);
  assert.ok(all.view3d && all.view3dByOption.grey);
  assert.deepEqual(resolveMedia3d(null, urlFor), { view3d: null, view3dByOption: {} });
});
