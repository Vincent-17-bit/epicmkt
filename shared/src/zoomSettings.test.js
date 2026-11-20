import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ZOOM_SETTINGS, ZOOM_LENSES, isValidZoomSettings, normalizeZoomSettings, zoomOptions } from "./zoomSettings.js";

test("anything unusable falls back to the defaults", () => {
  assert.deepEqual(normalizeZoomSettings(null), DEFAULT_ZOOM_SETTINGS);
  assert.deepEqual(normalizeZoomSettings({ enabled: "yes", scale: 7, lens: "pink" }), DEFAULT_ZOOM_SETTINGS);
});

test("good values are kept", () => {
  assert.deepEqual(normalizeZoomSettings({ enabled: false, scale: 3, lens: "teal" }), { enabled: false, scale: 3, lens: "teal" });
});

test("only the offered scales and lenses are valid", () => {
  assert.equal(isValidZoomSettings({ enabled: true, scale: 2.5, lens: "royal" }), true);
  assert.equal(isValidZoomSettings({ enabled: true, scale: 4, lens: "royal" }), false);
  assert.equal(isValidZoomSettings({ enabled: true, scale: 2, lens: "#ff0000" }), false);
  assert.equal(isValidZoomSettings({ scale: 2, lens: "sky" }), false);
});

test("switched off gives false, otherwise the gallery options", () => {
  assert.equal(zoomOptions({ enabled: false, scale: 2, lens: "sky" }), false);
  assert.deepEqual(zoomOptions({ enabled: true, scale: 3, lens: "indigo" }), {
    scale: 3,
    lensColor: ZOOM_LENSES.indigo.fill,
    lensBorder: ZOOM_LENSES.indigo.edge,
    lensBorderDark: ZOOM_LENSES.indigo.edgeDark
  });
});
