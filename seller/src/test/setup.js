import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { setUserTimeZone } from "@epicmkt/shared";
import { cleanup } from "@testing-library/react";

// Tests read as a seller in Nairobi, whatever zone the machine running them is in. Zone specific tests override this.
beforeEach(() => setUserTimeZone("Africa/Nairobi"));
afterEach(() => {
  cleanup();
  // The item editor keeps unsaved drafts in localStorage; one test's draft must never reach the next.
  try { localStorage.clear(); } catch { /* no storage in this environment */ }
  setUserTimeZone(null);
});

if (!window.matchMedia) {
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
}

// jsdom has no modal <dialog>; open and close it by its `open` attribute so dialogs can be tested.
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
}
