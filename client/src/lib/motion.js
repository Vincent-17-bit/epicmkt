export function motionAllowed() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = navigator.connection;
  if (connection?.saveData) return false;
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) return false;
  return true;
}
