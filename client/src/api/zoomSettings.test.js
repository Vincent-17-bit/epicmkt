import { describe, expect, it } from "vitest";
import { DEFAULT_ZOOM_SETTINGS } from "@epicmkt/shared";
import { getZoomSettings } from "./zoomSettings.js";

describe("zoom settings in the demo", () => {
  it("are the defaults", async () => {
    expect(await getZoomSettings()).toEqual(DEFAULT_ZOOM_SETTINGS);
  });
});
