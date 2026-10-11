import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffMedia, inspectMedia, inspectVariant, videoCodec, variantWidthsFor, parseMediaPath, mediaObjectPath, MEDIA_RULES } from "./media.js";
import {
  mediaLimitsFor, mediaCounts, mediaCounterText, mediaRoom, atMediaLimit, customerMedia, coverOf, canPublish, galleryItems,
  moveInList, withSorts, suggestAlt, clampAlt, altProblem, classifyFile, checkImage, checkVideo, formatDuration, humanSize, mediaErrorMessage, sortMedia,
} from "./media-model.js";
import { png, jpeg, webp, mp4, mov, webm, heic, pad, disguised, hasMetadata } from "./media-fixtures.js";

const GLOBAL = {
  standard: { photosPerItem: 7, videosPerItem: 1 },
  premium: { photosPerItem: 15, videosPerItem: 3 },
};
const m = (id, kind, sort, extra = {}) => ({ id, kind, sort, status: "ready", removedByAdmin: false, url: `u/${id}`, ...extra });

test("plan limits and the counter text: Standard 7 photos + 1 video, Premium 15 + 3", () => {
  assert.deepEqual(mediaLimitsFor(GLOBAL, "standard"), { photos: 7, videos: 1 });
  assert.deepEqual(mediaLimitsFor(GLOBAL, "premium"), { photos: 15, videos: 3 });
  assert.deepEqual(mediaLimitsFor({ standard: { photosPerItem: null, videosPerItem: 2 } }, "standard"), { photos: null, videos: 2 });
  const std = mediaLimitsFor(GLOBAL, "standard");
  const pro = mediaLimitsFor(GLOBAL, "premium");
  assert.equal(mediaCounterText({ photos: 3, videos: 0 }, std), "3 of 7 photos, 0 of 1 video");
  assert.equal(mediaCounterText({ photos: 7, videos: 1 }, std), "7 of 7 photos, 1 of 1 video");
  assert.equal(mediaCounterText({ photos: 3, videos: 0 }, pro), "3 of 15 photos, 0 of 3 videos");
  assert.equal(mediaCounterText({ photos: 1, videos: 2 }, { photos: null, videos: null }), "1 photo, 2 videos");
  assert.deepEqual(mediaRoom({ photos: 7, videos: 0 }, std), { photos: 0, videos: 1 });
  assert.equal(atMediaLimit({ photos: 7, videos: 0 }, std, "image"), true);
  assert.equal(atMediaLimit({ photos: 7, videos: 0 }, std, "video"), false);
  assert.equal(atMediaLimit({ photos: 14, videos: 3 }, pro, "image"), false);
  assert.equal(atMediaLimit({ photos: 15, videos: 3 }, pro, "video"), true);
  assert.equal(atMediaLimit({ photos: 999, videos: 999 }, { photos: null, videos: null }, "image"), false);
});

test("failed uploads and admin-removed media do not use up a slot; processing ones do", () => {
  const list = [m("a", "image", 0), m("b", "image", 1, { status: "failed" }), m("c", "image", 2, { removedByAdmin: true }), m("d", "image", 3, { status: "processing" }), m("e", "video", 4)];
  assert.deepEqual(mediaCounts(list), { photos: 2, videos: 1 });
});

test("shoppers see ready media only, in order; the cover is the first image even when a video is first", () => {
  const list = [
    m("video", "video", 0, { posterUrl: "p" }),
    m("proc", "image", 1, { status: "processing" }),
    m("img1", "image", 2),
    m("gone", "image", 3, { removedByAdmin: true }),
    m("bad", "image", 4, { status: "failed" }),
    m("img2", "image", 5),
  ];
  assert.deepEqual(customerMedia(list).map((x) => x.id), ["video", "img1", "img2"]);
  assert.equal(coverOf(list).id, "img1");
  assert.equal(canPublish(list), true);
  assert.equal(coverOf([m("v", "video", 0)]), null);
  assert.equal(canPublish([m("v", "video", 0)]), false);
  assert.equal(canPublish([m("p", "image", 0, { status: "processing" })]), false);
  assert.equal(canPublish([m("r", "image", 0, { removedByAdmin: true })]), false);
  assert.equal(canPublish([]), false);
});

test("ordering is by sort, then by age, then by id, and never mutates the input", () => {
  const list = [m("b", "image", 1), m("a", "image", 1), m("z", "image", 0)];
  const before = list.map((x) => x.id);
  assert.deepEqual(sortMedia(list).map((x) => x.id), ["z", "a", "b"]);
  assert.deepEqual(list.map((x) => x.id), before);
  const moved = moveInList(["a", "b", "c", "d"], 3, 0);
  assert.deepEqual(moved, ["d", "a", "b", "c"]);
  assert.deepEqual(moveInList(["a", "b"], 0, 5), ["a", "b"]);
  assert.deepEqual(withSorts([{ id: "x", sort: 9 }, { id: "y", sort: 1 }]).map((x) => x.sort), [0, 1]);
});

test("the gallery gets exactly the customer order, with alt text and a poster for videos", () => {
  const list = [
    m("v", "video", 0, { posterUrl: "poster.webp", durationSec: 12, alt: "" }),
    m("i1", "image", 1, { alt: "Front", srcSet: "a 320w, b 640w" }),
    m("hidden", "image", 2, { removedByAdmin: true }),
    m("i2", "image", 3),
  ];
  const items = galleryItems(list, "Red shirt");
  assert.deepEqual(items.map((x) => x.id), ["v", "i1", "i2"]);
  assert.deepEqual(items.map((x) => x.kind), ["video", "image", "image"]);
  assert.equal(items[0].poster, "poster.webp");
  assert.equal(items[0].alt, "Red shirt - view 1");
  assert.equal(items[1].alt, "Front");
  assert.equal(items[1].srcSet, "a 320w, b 640w");
  assert.equal(items[2].alt, "Red shirt - view 3");
  assert.equal("autoplay" in items[0], false);
});

test("alt text: 120 characters, suggested as 'Item name - view N'", () => {
  assert.equal(suggestAlt("Red shirt", 2), "Red shirt - view 2");
  assert.equal(suggestAlt("", 1), "Item - view 1");
  assert.equal(suggestAlt("x".repeat(200), 12).length, 120);
  assert.ok(suggestAlt("x".repeat(200), 12).endsWith(" - view 12"));
  assert.equal(clampAlt("a".repeat(130)).length, 120);
  assert.equal(clampAlt("  two   spaces "), " two spaces ");
  assert.equal(altProblem("a".repeat(120)), "");
  assert.notEqual(altProblem("a".repeat(121)), "");
});

test("image checks: reject under 600px, warn under 1000px, reject over 15 MB", () => {
  const mb = 1024 * 1024;
  assert.equal(checkImage({ width: 599, height: 400, bytes: mb }).ok, false);
  assert.equal(checkImage({ width: 599, height: 400, bytes: mb }).code, "too_small");
  assert.equal(checkImage({ width: 400, height: 599, bytes: mb }).ok, false);
  const edge = checkImage({ width: 600, height: 400, bytes: mb });
  assert.equal(edge.ok, true);
  assert.ok(edge.warning);
  assert.ok(checkImage({ width: 999, height: 700, bytes: mb }).warning);
  assert.equal(checkImage({ width: 1000, height: 700, bytes: mb }).warning, undefined);
  assert.equal(checkImage({ width: 4000, height: 3000, bytes: 15 * mb }).ok, true);
  const big = checkImage({ width: 4000, height: 3000, bytes: 15 * mb + 1 });
  assert.deepEqual([big.ok, big.code], [false, "too_large"]);
});

test("video checks: 45 seconds, 25 MB, MOV only when the browser can play it, HEVC warns", () => {
  const mb = 1024 * 1024;
  assert.equal(checkVideo({ durationSec: 45, bytes: mb, type: "mp4" }).ok, true);
  assert.equal(checkVideo({ durationSec: 45.5, bytes: mb, type: "mp4" }).code, "too_long");
  assert.equal(checkVideo({ durationSec: 60, bytes: mb, type: "mp4" }).code, "too_long");
  assert.equal(checkVideo({ durationSec: 10, bytes: 25 * mb, type: "mp4" }).ok, true);
  assert.equal(checkVideo({ durationSec: 10, bytes: 25 * mb + 1, type: "mp4" }).code, "too_large");
  assert.equal(checkVideo({ durationSec: Infinity, bytes: mb, type: "webm" }).code, "unreadable");
  assert.equal(checkVideo({ durationSec: 0, bytes: mb, type: "webm" }).code, "unreadable");
  assert.equal(checkVideo({ durationSec: 10, bytes: mb, type: "mov", canPlay: false }).code, "mov_unplayable");
  assert.equal(checkVideo({ durationSec: 10, bytes: mb, type: "mov", canPlay: true }).ok, true);
  const hevc = checkVideo({ durationSec: 10, bytes: mb, type: "mp4", hevc: true });
  assert.equal(hevc.ok, true);
  assert.match(hevc.warning, /HEVC/);
  assert.equal(formatDuration(12), "0:12");
  assert.equal(formatDuration(75.4), "1:15");
  assert.equal(humanSize(1536), "2 KB");
  assert.equal(humanSize(3 * 1024 * 1024), "3.0 MB");
});

test("file names and types are only a first guess", () => {
  assert.deepEqual(classifyFile({ name: "a.JPG", type: "image/jpeg" }), { kind: "image", heic: false });
  assert.deepEqual(classifyFile({ name: "IMG_1.HEIC", type: "" }), { kind: "image", heic: true });
  assert.deepEqual(classifyFile({ name: "x", type: "image/heif" }), { kind: "image", heic: true });
  assert.deepEqual(classifyFile({ name: "c.mov", type: "video/quicktime" }), { kind: "video", mov: true });
  assert.deepEqual(classifyFile({ name: "c.mp4", type: "video/mp4" }), { kind: "video", mov: false });
  assert.equal(classifyFile({ name: "virus.exe", type: "application/x-msdownload" }), null);
  assert.equal(classifyFile({ name: "notes.pdf", type: "application/pdf" }), null);
  assert.ok(mediaErrorMessage("limit_reached"));
  assert.ok(mediaErrorMessage("nonsense").length > 5);
});

test("responsive widths: 320 to 1600, plus 2000 for zoom only when the source is that wide", () => {
  assert.deepEqual(variantWidthsFor(4000), [320, 640, 960, 1280, 1600, 2000]);
  assert.deepEqual(variantWidthsFor(2000), [320, 640, 960, 1280, 1600, 2000]);
  assert.deepEqual(variantWidthsFor(1999), [320, 640, 960, 1280, 1600]);
  assert.deepEqual(variantWidthsFor(1600), [320, 640, 960, 1280, 1600]);
  assert.deepEqual(variantWidthsFor(1000), [320, 640, 960, 1000]);
  assert.deepEqual(variantWidthsFor(700), [320, 640, 700]);
  assert.deepEqual(variantWidthsFor(600), [320, 600]);
  assert.deepEqual(variantWidthsFor(0), []);
});

test("every object lives at <business>/<item>/<media>/<file>", () => {
  const biz = "10000000-0000-4000-8000-0000000000a1";
  const item = "20000000-0000-4000-8000-000000000001";
  const media = "30000000-0000-4000-8000-000000000001";
  const path = mediaObjectPath({ businessId: biz, itemId: item, mediaId: media }, "w640.webp");
  assert.equal(path, `${biz}/${item}/${media}/w640.webp`);
  assert.deepEqual(parseMediaPath(path, { businessId: biz, itemId: item }), { businessId: biz, itemId: item, mediaId: media, file: "w640.webp", folder: `${biz}/${item}/${media}` });
  assert.equal(parseMediaPath(path, { businessId: "other" }), null);
  assert.equal(parseMediaPath(path, { itemId: "other" }), null);
  for (const bad of [`${biz}/${item}/a.webp`, `${biz}/${item}/${media}/x/y.webp`, `${biz}/${item}/${media}/../x.webp`, `/${path}`, `${biz}/${item}/nope/a.webp`, `${biz}/${item}/${media}/.hidden`, `${biz}/${item}/${media}/a b.webp`, `${biz}\\${item}\\${media}\\a.webp`, "", null, 7]) {
    assert.equal(parseMediaPath(bad, { businessId: biz, itemId: item }), null, String(bad));
  }
});

test("the server reads the real type from bytes: HEIC and AVIF are refused, MOV is a video, disguised files are nothing", () => {
  assert.equal(sniffMedia(heic()).accepted, false);
  assert.equal(inspectMedia(heic()).reason, "unsupported_type");
  assert.equal(sniffMedia(mov(640, 480, 5)).type, "mov");
  assert.equal(sniffMedia(mp4(640, 480, 5)).type, "mp4");
  for (const [name, make] of Object.entries(disguised)) assert.equal(inspectMedia(make()).reason, "unsupported_type", name);
  const clip = inspectMedia(mov(640, 480, 9));
  assert.deepEqual([clip.ok, clip.kind, clip.mime, clip.durationSec], [true, "video", "video/quicktime", 9]);
});

test("server limits: 600px on the long side, 200px on the short side, 45 seconds", () => {
  assert.equal(MEDIA_RULES.videoMaxSeconds, 45);
  assert.equal(inspectMedia(png(599, 599)).reason, "too_small");
  assert.equal(inspectMedia(png(600, 200)).ok, true);
  assert.equal(inspectMedia(png(600, 199)).reason, "too_small");
  assert.equal(inspectMedia(jpeg(1600, 1200)).ok, true);
  assert.equal(inspectMedia(mp4(640, 480, 46)).reason, "too_long");
  assert.equal(inspectMedia(webm(640, 480, 45)).ok, true);
  assert.equal(inspectMedia(webm(640, 480, 47)).reason, "too_long");
});

test("variants and posters are small by design but must still be real images", () => {
  assert.equal(inspectVariant(webp(320, 107)).ok, true);
  assert.equal(inspectVariant(webp(16, 16)).ok, true);
  assert.equal(inspectVariant(webp(8, 8)).reason, "too_big_dimensions");
  assert.equal(inspectVariant(disguised.exe()).reason, "unsupported_type");
  assert.equal(inspectVariant(mp4(640, 480, 5)).reason, "unsupported_type");
  assert.equal(inspectVariant(heic()).reason, "unsupported_type");
  assert.equal(inspectVariant(pad(webp(320, 240), 3 * 1024 * 1024 + 1)).reason, "too_large");
});

test("the codec is read from the file, so an iPhone HEVC clip is told apart from H.264", () => {
  assert.equal(videoCodec(mp4(640, 480, 5, { codec: "h264" }), "mp4"), "h264");
  assert.equal(videoCodec(mp4(640, 480, 5, { codec: "hevc" }), "mp4"), "hevc");
  assert.equal(videoCodec(mp4(640, 480, 5, { codec: null }), "mp4"), "unknown");
  assert.equal(inspectMedia(mp4(640, 480, 5, { codec: "hevc" })).codec, "hevc");
  assert.equal(inspectMedia(mov(640, 480, 5)).codec, "h264");
});

test("the metadata detector sees what a phone photo carries", () => {
  assert.equal(hasMetadata(jpeg(1000, 800, { exif: true })), true);
  assert.equal(hasMetadata(jpeg(1000, 800)), false);
  assert.equal(hasMetadata(webp(640, 480)), false);
});
