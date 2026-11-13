import test from "node:test";
import assert from "node:assert/strict";
import { addAxis, addValue, emptyOptionsForm } from "./editor.js";
import { colourPhotoStatus, isColourAxis, setValueMedia } from "./colourPhotos.js";

const PHOTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const build = () => {
  let o = emptyOptionsForm();
  o = addAxis(o, { label: "Colour", display: "swatch" });
  for (const v of ["Black", "Grey"]) o = addValue(o, "colour", v).options;
  o = addAxis(o, { label: "Storage", display: "button" });
  o = addValue(o, "storage", "64 GB").options;
  return o;
};

test("only colour-like options need photos", () => {
  const o = build();
  assert.equal(isColourAxis(o.axes[0]), true);
  assert.equal(isColourAxis(o.axes[1]), false);
});

test("a colour is covered once it points at one of the item's photos", () => {
  let o = build();
  assert.deepEqual(colourPhotoStatus(o, [PHOTO]).map((c) => c.count), [0, 0]);
  o = setValueMedia(o, "colour", "black", PHOTO);
  assert.deepEqual(colourPhotoStatus(o, [PHOTO]).map((c) => c.count), [1, 0]);
  assert.deepEqual(colourPhotoStatus(o, []).map((c) => c.count), [0, 0]);
  o = setValueMedia(o, "colour", "black", null);
  assert.equal(o.axes[0].values[0].mediaId, undefined);
});

test("an item with no colour option has nothing to check", () => {
  assert.deepEqual(colourPhotoStatus(emptyOptionsForm(), [PHOTO]), []);
});
