// After Continue or Send finds problems: take the person to the first one. Called from an effect, after React has drawn the error
// messages and the aria-invalid marks (calling it straight from the click handler, in a requestAnimationFrame, could run before that
// render, find nothing and leave the person at the bottom of the form).
//
//  - The first problem is the first box marked aria-invalid, or the first error message (a document card) when no box is marked.
//  - When that box has its message ABOVE it (the business type list), the message is what is brought into view, so the person reads
//    it before the long list under it. A box taller than half the screen is brought in by its top, never its middle.
//  - When the first problem is far from the error summary at the top of the step (more than a screen and a half), the summary is
//    focused instead: it lists every problem with a link to each, so nobody is dropped into the middle of a long form.
//  - The box itself gets the focus (or its first control, for a group), without a second jump.
const FOCUSABLE = "input:not([type=hidden]), select, textarea, button, [tabindex]:not([tabindex='-1'])";

const reduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const messageAbove = (el) => {
  const ids = String(el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)).find((m) => m && m.textContent.trim() && (m.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) ?? null;
};

export function showFirstProblem({ scroller = document.getElementById("seller-scroll") } = {}) {
  const behavior = reduced() ? "auto" : "smooth";
  const summary = document.getElementById("error-summary");
  const bad = document.querySelector('form [aria-invalid="true"]');
  const note = document.querySelector("form [data-error]");
  const target = bad ?? note?.closest("[data-invalid]") ?? note;
  if (!target) {
    summary?.scrollIntoView?.({ block: "start", behavior });
    summary?.focus({ preventScroll: true });
    return "summary";
  }
  const anchor = (bad && messageAbove(bad)) ?? target;
  const screen = scroller?.clientHeight || window.innerHeight || 800;
  if (summary) {
    const gap = anchor.getBoundingClientRect().top - summary.getBoundingClientRect().bottom;
    if (gap > screen * 1.5) {
      summary.scrollIntoView?.({ block: "start", behavior });
      summary.focus({ preventScroll: true });
      return "summary";
    }
  }
  const tall = anchor.getBoundingClientRect().height > screen / 2;
  anchor.scrollIntoView?.({ block: anchor !== target || tall ? "start" : "center", behavior });
  const focusable = bad ? (bad.matches(FOCUSABLE) ? bad : bad.querySelector(FOCUSABLE)) : null;
  focusable?.focus({ preventScroll: true });
  return "field";
}
