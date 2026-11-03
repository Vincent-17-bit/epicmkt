import { scrollBehavior } from "./motion.js";

/** Scroll to the top of the page and move focus to the main region, without a second scroll. */
export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
  document.getElementById("main")?.focus({ preventScroll: true });
}
