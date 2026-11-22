// Nothing else on the site may touch the Saved list: not the location reset, not clearing recent searches, not a theme change.
import { beforeEach, describe, expect, it } from "vitest";
import { createSavedList, SAVED_KEY } from "./savedList.js";
import { addRecent, clearRecent } from "./recentSearches.js";

describe("the Saved list key is left alone by the rest of the site", () => {
  beforeEach(() => localStorage.clear());

  it("survives clearing recent searches, a location reset and a theme change", async () => {
    createSavedList({ storage: localStorage }).add({ itemId: "i1", businessId: "b1", qty: 2, snap: { name: "Table" } });
    const before = localStorage.getItem(SAVED_KEY);
    expect(before).toBeTruthy();

    addRecent("sofa");
    clearRecent();

    const { useGeoStore } = await import("../stores/geo.js");
    useGeoStore.getState().reset?.();

    document.documentElement.dataset.theme = "dark";
    localStorage.setItem("epicmkt-theme", "dark");
    document.documentElement.dataset.theme = "light";

    expect(localStorage.getItem(SAVED_KEY)).toBe(before);
    expect(createSavedList({ storage: localStorage }).count()).toBe(1);
  });
});
