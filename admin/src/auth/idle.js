// Idle timeout. Warn first, then sign out. Pure so it can be tested without timers.
export const IDLE_WARN_MS = 13 * 60_000;
export const IDLE_LIMIT_MS = 15 * 60_000;

export function idleState(now, lastActive, { warnMs = IDLE_WARN_MS, limitMs = IDLE_LIMIT_MS } = {}) {
  const idle = Math.max(0, now - lastActive);
  if (idle >= limitMs) return { phase: "expired", secondsLeft: 0 };
  if (idle >= warnMs) return { phase: "warning", secondsLeft: Math.ceil((limitMs - idle) / 1000) };
  return { phase: "active", secondsLeft: Math.ceil((limitMs - idle) / 1000) };
}
