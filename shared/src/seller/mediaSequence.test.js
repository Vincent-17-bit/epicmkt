import { test } from "node:test";
import assert from "node:assert/strict";
import { canAdd, classifyFile, coverIndex, coverNote, formatDuration, limitNote, mediaLimitsOf, mediaSummary, mediaUsage, moveAnnouncement, moveMedia, sizeProblem, videoFileProblem } from "./mediaSequence.js";

const p = (id) => ({ id, kind: "image" });
const v = (id) => ({ id, kind: "video" });

test("limits come from the plan numbers and unknown values stay unlimited", () => {
  assert.deepEqual(mediaLimitsOf({ photosPerItem: 15, videosPerItem: 3 }), { photos: 15, videos: 3 });
  assert.deepEqual(mediaLimitsOf({ photosPerItem: null }), { photos: null, videos: null });
  assert.deepEqual(mediaLimitsOf(undefined), { photos: null, videos: null });
  assert.deepEqual(mediaLimitsOf({ photosPerItem: 0, videosPerItem: 0 }), { photos: 0, videos: 0 });
});

test("usage and summary read like the screen text", () => {
  const usage = mediaUsage([p(1), p(2), p(3), v(4)], { photos: 10, videos: 2 });
  assert.equal(mediaSummary(usage), "3 of 10 photos, 1 of 2 videos");
  assert.equal(usage.photos.left, 7);
  assert.equal(canAdd(usage, "image"), true);
  assert.equal(mediaSummary(mediaUsage([p(1)], { photos: 1, videos: 1 })), "1 of 1 photo, 0 of 1 video");
  assert.equal(mediaSummary(mediaUsage([p(1), v(2)], { photos: null, videos: null })), "1 photo, 1 video");
});

test("a full kind cannot be added and explains why, without touching the other kind", () => {
  const usage = mediaUsage([p(1), p(2), v(3)], { photos: 2, videos: 3 });
  assert.equal(canAdd(usage, "image"), false);
  assert.equal(canAdd(usage, "video"), true);
  assert.match(limitNote(usage, "image"), /allows 2 photos per item/);
  assert.equal(limitNote(usage, "video"), null);
  assert.match(limitNote(mediaUsage([v(1)], { photos: 5, videos: 1 }), "video"), /allows 1 video per item/);
});

test("the cover is the first photo and a video can never be the cover", () => {
  assert.equal(coverIndex([v(1), p(2), p(3)]), 1);
  assert.equal(coverIndex([p(1), v(2)]), 0);
  assert.equal(coverIndex([v(1)]), -1);
  assert.equal(coverNote([v(1), p(2)]), "Cover will be the next photo");
  assert.equal(coverNote([p(1), v(2)]), null);
  assert.equal(coverNote([v(1), v(2)]), "Add a photo to set the cover");
  assert.equal(coverNote([]), null);
});

test("moveMedia moves one item and ignores moves that go nowhere", () => {
  const list = [p(1), v(2), p(3)];
  assert.deepEqual(moveMedia(list, 2, 0).map((m) => m.id), [3, 1, 2]);
  assert.equal(moveMedia(list, 1, 1), list);
  assert.equal(moveMedia(list, 0, 3), list);
  assert.equal(moveMedia(list, -1, 0), list);
});

test("the announcement names the item, its new place and a cover change", () => {
  assert.equal(moveAnnouncement([p(1), p(2), p(3)], 1, 0), "Photo 2 moved to position 1.");
  assert.equal(moveAnnouncement([p(1), v(2)], 1, 0), "Video 2 moved to position 1. Cover will be the next photo.");
  assert.equal(moveAnnouncement([p(1)], 4, 0), "");
});

test("files are classified, with phone formats called out", () => {
  const f = (type, name = "x") => ({ type, name });
  assert.deepEqual(classifyFile(f("image/webp")), { kind: "image", code: null });
  assert.deepEqual(classifyFile(f("video/mp4")), { kind: "video", code: null });
  assert.equal(classifyFile(f("video/quicktime", "a.mov")).code, "video_mov");
  assert.equal(classifyFile(f("", "clip.MOV")).code, "video_mov");
  assert.equal(classifyFile(f("image/heic", "a.heic")).code, "photo_heic");
  assert.equal(classifyFile(f("", "a.HEIC")).code, "photo_heic");
  assert.equal(classifyFile(f("video/x-matroska", "a.mkv")).code, "video_mov");
  assert.equal(classifyFile(f("video/ogg", "a.ogv")).code, "video_unsupported");
  assert.equal(classifyFile(f("image/gif", "a.gif")).code, "unsupported_type");
  assert.deepEqual(classifyFile(f("", "a.mp4")), { kind: "video", code: null });
  assert.equal(classifyFile(f("application/pdf", "a.pdf")).code, "media_unsupported");
});

test("size and length rules match the server", () => {
  assert.equal(sizeProblem("image", 10 * 1024 * 1024), null);
  assert.equal(sizeProblem("image", 10 * 1024 * 1024 + 1), "too_large");
  assert.equal(sizeProblem("video", 25 * 1024 * 1024 + 1), "video_too_large");
  assert.equal(videoFileProblem({ size: 1, durationSec: 60 }), null);
  assert.equal(videoFileProblem({ size: 1, durationSec: 60.5 }), "video_too_long");
  assert.equal(videoFileProblem({ size: 26 * 1024 * 1024, durationSec: 5 }), "video_too_large");
});

test("durations print as m:ss", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(9.6), "0:10");
  assert.equal(formatDuration(75), "1:15");
  assert.equal(formatDuration(undefined), "0:00");
});
