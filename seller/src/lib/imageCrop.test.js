import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ZOOM, SHOP_IMAGES, baseScale, cropRect, outputSize, panBy, safeShare, sourceProblem, startState, viewFor, zoomAbout } from "./imageCrop.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

const COVER = { w: 600, h: 200 }; // a 3:1 frame, in screen pixels
const SQUARE = { w: 300, h: 300 };
const PHOTOS = [
  { name: "landscape 4:3", img: { w: 4000, h: 3000 } },
  { name: "portrait 3:4", img: { w: 3000, h: 4000 } },
  { name: "panorama", img: { w: 6000, h: 1000 } },
  { name: "tall skinny", img: { w: 800, h: 5000 } },
  { name: "small", img: { w: 650, h: 220 } },
];

test("at zoom 1 the picture exactly covers the frame on one axis and never falls short on the other", () => {
  for (const { name, img } of PHOTOS) {
    for (const frame of [COVER, SQUARE]) {
      const v = viewFor({ img, frame, ...startState(img) });
      assert.ok(img.w * v.scale >= frame.w - 1e-6 && img.h * v.scale >= frame.h - 1e-6, `${name}: covers the frame`);
      const tight = Math.min(img.w * v.scale - frame.w, img.h * v.scale - frame.h);
      near(tight, 0, 1e-6);
    }
  }
});

test("the crop keeps the frame's shape, so the picture is never stretched", () => {
  for (const { img } of PHOTOS) {
    for (const frame of [COVER, SQUARE]) {
      for (const zoom of [1, 1.7, MAX_ZOOM]) {
        const r = cropRect({ zoom, cx: img.w / 3, cy: img.h / 3 }, { img, frame });
        near(r.sw / r.sh, frame.w / frame.h, 1e-9);
      }
    }
  }
});

test("the crop can never leave the picture, however far it is dragged", () => {
  for (const { img } of PHOTOS) {
    const ctx = { img, frame: COVER };
    let s = startState(img);
    for (const [dx, dy] of [[1e6, 1e6], [-1e6, -1e6], [1e6, -1e6], [-1e6, 1e6]]) {
      s = panBy(s, ctx, dx, dy);
      const r = cropRect(s, ctx);
      assert.ok(r.sx >= -1e-6 && r.sy >= -1e-6, "starts inside");
      assert.ok(r.sx + r.sw <= img.w + 1e-6 && r.sy + r.sh <= img.h + 1e-6, "ends inside");
    }
  }
});

test("dragging past an edge stores a clamped state, so there is no dead zone to drag back through", () => {
  const img = { w: 4000, h: 3000 };
  const ctx = { img, frame: COVER };
  const s0 = { zoom: 2, cx: 2000, cy: 1500 };
  const edge = panBy(s0, ctx, 1e6, 0);
  const v = viewFor({ ...ctx, ...edge });
  near(edge.cx, v.cx); // what is stored is what is shown
  const back = panBy(edge, ctx, -10, 0); // one small drag the other way moves the picture straight away
  assert.ok(back.cx > edge.cx);
});

test("dragging right moves the picture right, so the visible window moves left", () => {
  const img = { w: 4000, h: 3000 };
  const ctx = { img, frame: COVER };
  const s = { zoom: 2, cx: 2000, cy: 1500 };
  const moved = panBy(s, ctx, 60, 0);
  assert.ok(moved.cx < s.cx);
  near(moved.cy, s.cy);
});

test("a photo that only just fits has nothing to pan on the tight axis", () => {
  const img = { w: 600, h: 200 }; // already 3:1
  const ctx = { img, frame: COVER };
  const s = panBy(startState(img), ctx, 500, 500);
  near(s.cx, 300);
  near(s.cy, 100);
});

test("zooming about a point keeps the picture under that point still", () => {
  const img = { w: 4000, h: 3000 };
  const ctx = { img, frame: COVER };
  const before = { zoom: 1.5, cx: 2100, cy: 1400 };
  const focus = { x: 120, y: -30 };
  const v1 = viewFor({ ...ctx, ...before });
  const under = { x: v1.cx + focus.x / v1.scale, y: v1.cy + focus.y / v1.scale };
  const after = zoomAbout(before, ctx, 2.5, focus);
  const v2 = viewFor({ ...ctx, ...after });
  near(v2.cx + focus.x / v2.scale, under.x, 1e-6);
  near(v2.cy + focus.y / v2.scale, under.y, 1e-6);
  near(after.zoom, 2.5);
});

test("zoom is held between 1 and the maximum", () => {
  const img = { w: 4000, h: 3000 };
  const ctx = { img, frame: COVER };
  assert.equal(zoomAbout(startState(img), ctx, 0.2).zoom, 1);
  assert.equal(zoomAbout(startState(img), ctx, 99).zoom, MAX_ZOOM);
});

test("resizing the frame keeps the same part of the picture in view", () => {
  const img = { w: 4000, h: 3000 };
  const s = { zoom: 2, cx: 1800, cy: 1300 };
  const small = viewFor({ img, frame: { w: 300, h: 100 }, ...s });
  const big = viewFor({ img, frame: { w: 900, h: 300 }, ...s });
  near(small.cx, big.cx);
  near(small.cy, big.cy);
  near(small.sw / small.sh, big.sw / big.sh, 1e-9);
});

test("the output is the target size, and is never upscaled past the pixels we have", () => {
  const spec = SHOP_IMAGES.cover;
  assert.deepEqual(outputSize({ sw: 4000, sh: 1333 }, spec), { w: 1500, h: 500 });
  assert.deepEqual(outputSize({ sw: 750, sh: 250 }, spec), { w: 750, h: 250 });
  const logo = outputSize({ sw: 300, sh: 300 }, SHOP_IMAGES.logo);
  assert.deepEqual(logo, { w: 300, h: 300 });
});

test("photos that are too small for a sharp result are refused with the right code", () => {
  assert.equal(sourceProblem({ w: 599, h: 400 }, SHOP_IMAGES.cover), "cover_too_small");
  assert.equal(sourceProblem({ w: 800, h: 199 }, SHOP_IMAGES.cover), "cover_too_small");
  assert.equal(sourceProblem({ w: 600, h: 200 }, SHOP_IMAGES.cover), null);
  assert.equal(sourceProblem({ w: 199, h: 500 }, SHOP_IMAGES.logo), "logo_too_small");
  assert.equal(sourceProblem({ w: 200, h: 200 }, SHOP_IMAGES.logo), null);
});

test("the guide shows what shop cards keep of a 3:1 cover", () => {
  near(safeShare(SHOP_IMAGES.cover, "card"), 2 / 3);
  near(safeShare(SHOP_IMAGES.cover, "square"), 1 / 3);
  assert.equal(safeShare(SHOP_IMAGES.logo, "card"), null);
});

test("the stored cover ratio matches its output size", () => {
  for (const spec of Object.values(SHOP_IMAGES)) near(spec.out.w / spec.out.h, spec.ratio, 1e-9);
  near(baseScale({ w: 100, h: 100 }, { w: 300, h: 100 }), 3);
});
