export function motionAllowed() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = navigator.connection;
  if (connection?.saveData) return false;
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) return false;
  return true;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** True when the visitor asked their device for less motion. */
export function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(REDUCED_MOTION)?.matches);
}

/** The `behavior` to pass to scrollTo, scrollBy and scrollIntoView. */
export function scrollBehavior() {
  return prefersReducedMotion() ? "auto" : "smooth";
}
