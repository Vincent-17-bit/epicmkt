// Works out the sidebar "System Status" card from what the admin app really knows. Pure function: no browser,
// no Supabase, so it is easy to test.
//
// The signals (all real, none hard coded):
//   - did the last request for the dashboard numbers succeed, and when? (the numbers are polled every minute)
//   - is the browser online?
//   - how many messages to sellers are stuck in the "failed" state (counts.failedMessages)
//
// Levels: checking | healthy | degraded | down

export const STALE_AFTER_MS = 3 * 60_000; // the numbers refresh every 60s; 3 missed refreshes is a problem

export function systemStatus({ isOnline = true, hasData = false, isError = false, updatedAt = 0, failedMessages = 0, now = Date.now() } = {}) {
  if (!isOnline) {
    return { level: "down", label: "Offline", detail: "No internet connection" };
  }
  if (!hasData) {
    return isError
      ? { level: "down", label: "Unreachable", detail: "Cannot reach the server" }
      : { level: "checking", label: "Checking", detail: "Contacting the server" };
  }
  if (isError) {
    return { level: "degraded", label: "Connection issue", detail: "Latest refresh failed" };
  }
  if (updatedAt && now - updatedAt > STALE_AFTER_MS) {
    return { level: "degraded", label: "Delayed", detail: "Data has not refreshed recently" };
  }
  if (failedMessages > 0) {
    const noun = failedMessages === 1 ? "message" : "messages";
    return { level: "degraded", label: "Attention", detail: `${failedMessages} ${noun} failed to send` };
  }
  return { level: "healthy", label: "Healthy", detail: "" };
}
