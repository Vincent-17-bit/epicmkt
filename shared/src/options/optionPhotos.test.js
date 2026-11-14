import test from "node:test";
import assert from "node:assert/strict";
import { addAxis, addValue, emptyOptionsForm, optionsPayload } from "./editor.js";
import { attachPhotos, axisHasPhotos, clearValuePhoto, focusMediaId, pendingPhotoTiles, photosByLabel, setValuePhoto, valuePhotoCount } from "./optionPhotos.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const build = () => {
  let o = emptyOptionsForm();
  o = addAxis(o, { label: "Type", display: "button" });
  for (const v of ["Super loaf", "Beta loaf"]) o = addValue(o, "type", v).options;
  o = addAxis(o, { label: "Size", display: "button" });
  for (const v of ["400g", "700g", "900g"]) o = addValue(o, "size", v).options;
  return o;
};

test("any option type can carry photos, not only colours", () => {
  let o = build();
  assert.equal(axisHasPhotos(o.axes[1]), false);
  o = setValuePhoto(o, "size", "400g", { mediaId: A });
  assert.equal(axisHasPhotos(o.axes[1]), true);
  assert.equal(valuePhotoCount(o.axes[1]), 1);
  o = clearValuePhoto(o, "size", "400g");
  assert.equal(o.axes[1].values[0].mediaId, undefined);
});

test("a photo still uploading is a marker that never reaches the saved payload", () => {
  let o = build();
  o = setValuePhoto(o, "size", "700g", { tile: "t1" });
  assert.deepEqual(pendingPhotoTiles(o), ["t1"]);
  const json = JSON.stringify(optionsPayload(o, true));
  assert.equal(json.includes("photoTile"), false);
  assert.equal(json.includes("t1"), false);
});

test("attachPhotos swaps markers for real ids and drops the ones whose upload failed", () => {
  let o = build();
  o = setValuePhoto(o, "size", "400g", { tile: "t1" });
  o = setValuePhoto(o, "size", "900g", { tile: "t2" });
  const r = attachPhotos(o, (t) => (t === "t1" ? A : null));
  assert.equal(r.linked, 1);
  assert.equal(r.missing, 1);
  assert.equal(r.options.axes[1].values[0].mediaId, A);
  assert.equal(r.options.axes[1].values[2].mediaId, undefined);
  assert.deepEqual(pendingPhotoTiles(r.options), []);
});

test("the gallery follows the value just picked, then the combination, then the other choices", () => {
  let o = build();
  o = setValuePhoto(o, "type", "super-loaf", { mediaId: A });
  o = setValuePhoto(o, "size", "900g", { mediaId: B });
  const choice = { type: "super-loaf", size: "900g" };
  assert.equal(focusMediaId({ axes: o.axes, choice, lastAxisKey: "type" }), A);
  assert.equal(focusMediaId({ axes: o.axes, choice, lastAxisKey: "size" }), B);
  assert.equal(focusMediaId({ axes: o.axes, choice, variant: { mediaIds: [B] }, lastAxisKey: null }), B);
  assert.equal(focusMediaId({ axes: o.axes, choice: { type: "super-loaf", size: "400g" } }), A);
  assert.equal(focusMediaId({ axes: build().axes, choice }), null);
  assert.equal(focusMediaId({}), null);
});

test("photosByLabel finds a size's picture by its name", () => {
  let o = build();
  o = setValuePhoto(o, "size", "700g", { mediaId: A });
  const m = photosByLabel(o.axes, [{ id: A, url: "u-a" }]);
  assert.deepEqual(m.get("700g"), { id: A, url: "u-a" });
  assert.equal(m.get("400g"), undefined);
});

import { photoForRow, rowForLabel, valueForRow } from "./optionPhotos.js";

test("a guide row finds the option value and the photo it stands for, by any cell", () => {
  let o = build();
  o = setValuePhoto(o, "size", "700g", { mediaId: A });
  const rows = [["Standard", "400g", "16"], ["medium", "700g", "–"], ["large", "900g", "–"]];
  assert.deepEqual(valueForRow(o.axes, rows[1]), { axisKey: "size", valueId: "700g", label: "700g" });
  assert.equal(valueForRow(o.axes, ["Jumbo", "2kg"]), null);
  const photos = photosByLabel(o.axes, [{ id: A, url: "u-a" }]);
  assert.equal(photoForRow(photos, rows[1]).url, "u-a");
  assert.equal(photoForRow(photos, rows[0]), null);
  assert.equal(rowForLabel(rows, "700g"), 1);
  assert.equal(rowForLabel(rows, "LARGE"), 2);
  assert.equal(rowForLabel(rows, "nope"), -1);
  assert.equal(rowForLabel(rows, ""), -1);
});

import { columnHelp } from "./sizeGuide.js";
test("the confusing guide columns explain themselves", () => {
  assert.match(columnHelp("Serves (people)"), /how many people/i);
  assert.match(columnHelp("serves"), /not a product name/i);
  assert.equal(columnHelp("Bust"), "");
});
