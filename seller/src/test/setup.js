import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { setUserTimeZone } from "@epicmkt/shared";
import { cleanup } from "@testing-library/react";

// Tests read as a seller in Nairobi, whatever zone the machine running them is in. Zone specific tests override this.
beforeEach(() => setUserTimeZone("Africa/Nairobi"));
afterEach(() => {
  cleanup();
  setUserTimeZone(null);
});

if (!window.matchMedia) {
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
}
