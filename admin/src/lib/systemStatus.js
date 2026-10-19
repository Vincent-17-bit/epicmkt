// Works out the sidebar "System Status" card from what the admin app really knows. Pure functions: no browser,
// no Supabase, so they are easy to test.
//
// Every line of the card is a real check against something the admin app already does:
//   Internet          the browser's online flag
//   Server            the request for the dashboard numbers (polled every minute)
//   Data freshness    how long ago that request last succeeded
//   Inbox             the request for unread seller messages (polled every minute)
//   Live updates      the realtime subscription that refreshes screens the moment data changes
//   Message delivery  messages to sellers stuck in the "failed" state
//
// Check levels: ok | warn | fail | pending | skipped. Overall levels: checking | healthy | degraded | down

import { timeAgo } from "./time.js";

export const STALE_AFTER_MS = 3 * 60_000; // numbers refresh every 60s; 3 missed refreshes is a problem

const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out/i;

// Turns a failed request into a short title plus a plain-language cause an admin can act on.
export function describeError(error) {
  const code = error?.code;
  const raw = String(error?.cause?.message ?? error?.message ?? "").trim();
  if (code === "unauthorized") {
    return { title: "Sign-in expired", cause: "Your session is no longer valid. Sign out and sign in again." };
  }
  if (code === "forbidden") {
    return {
      title: "Access denied",
      cause: "This account is not allowed to read this data (row-level security). Check that the account has the right role in the admins table.",
    };
  }
  if (code === "rate_limited") {
    return { title: "Too many requests", cause: "Supabase is rate limiting this browser. Wait a minute and it will recover by itself." };
  }
  if (NETWORK_FAILURE.test(raw)) {
    return {
      title: "Cannot reach Supabase",
      cause: "The request never got an answer. The Supabase project may be paused or down, the project URL may be wrong, or a network or firewall is blocking it.",
    };
  }
  return {
    title: "Server error",
    cause: `Supabase answered with an error${raw ? `: "${raw.slice(0, 160)}"` : ""}. Check the Supabase logs, and that the latest database migrations have been applied.`,
  };
}

const ago = (updatedAt, now) => timeAgo(updatedAt, new Date(now)) || "just now";

// The list shown when the card is opened.
export function buildChecks({
  isOnline = true,
  hasData = false,
  isError = false,
  error = null,
  updatedAt = 0,
  failedMessages = 0,
  inbox = null, // { hasData, isError, error } or null when the inbox query is not part of this view
  realtime = null, // "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED" | "connecting" | "unused" | null
  realtimeMessage = "",
  now = Date.now(),
} = {}) {
  const checks = [];

  checks.push(
    isOnline
      ? { id: "internet", label: "Internet connection", level: "ok", detail: "This device is online." }
      : {
          id: "internet",
          label: "Internet connection",
          level: "fail",
          detail: "This device is offline.",
          cause: "There is no internet connection. Reconnect and this will clear by itself.",
        },
  );

  if (!isOnline) {
    checks.push({ id: "server", label: "Server and database", level: "pending", detail: "Waiting for a connection." });
  } else if (isError && !hasData) {
    const d = describeError(error);
    checks.push({ id: "server", label: "Server and database", level: "fail", detail: d.title, cause: d.cause });
  } else if (isError) {
    const d = describeError(error);
    checks.push({ id: "server", label: "Server and database", level: "warn", detail: `Latest refresh failed: ${d.title}`, cause: d.cause });
  } else if (!hasData) {
    checks.push({ id: "server", label: "Server and database", level: "pending", detail: "Contacting the server…" });
  } else {
    checks.push({ id: "server", label: "Server and database", level: "ok", detail: "Dashboard numbers loaded." });
  }

  if (!hasData) {
    checks.push({ id: "fresh", label: "Data freshness", level: "pending", detail: "No data yet." });
  } else if (updatedAt && now - updatedAt > STALE_AFTER_MS) {
    checks.push({
      id: "fresh",
      label: "Data freshness",
      level: "warn",
      detail: `Last updated ${ago(updatedAt, now)}.`,
      cause: "Automatic refresh runs every minute and has stopped getting through. The connection may be failing or this tab may have been asleep.",
    });
  } else {
    checks.push({ id: "fresh", label: "Data freshness", level: "ok", detail: `Updated ${ago(updatedAt, now)}.` });
  }

  if (inbox) {
    if (inbox.isError) {
      const d = describeError(inbox.error);
      checks.push({ id: "inbox", label: "Messages inbox", level: "fail", detail: d.title, cause: d.cause });
    } else if (!inbox.hasData) {
      checks.push({ id: "inbox", label: "Messages inbox", level: "pending", detail: "Checking…" });
    } else {
      checks.push({ id: "inbox", label: "Messages inbox", level: "ok", detail: "Responding." });
    }
  }

  if (realtime === "unused") {
    checks.push({ id: "realtime", label: "Live updates", level: "skipped", detail: "Not used with demo data." });
  } else if (realtime) {
    if (realtime === "SUBSCRIBED") {
      checks.push({ id: "realtime", label: "Live updates", level: "ok", detail: "Connected. Screens refresh as data changes." });
    } else if (realtime === "connecting") {
      checks.push({ id: "realtime", label: "Live updates", level: "pending", detail: "Connecting…" });
    } else {
      checks.push({
        id: "realtime",
        label: "Live updates",
        level: "warn",
        detail: "Not connected.",
        cause: `The realtime connection is ${realtime === "CLOSED" ? "closed" : realtime === "TIMED_OUT" ? "timing out" : "failing"}${realtimeMessage ? ` (${realtimeMessage})` : ""}. Screens still refresh every minute, just not instantly. Check that Realtime is enabled for the tables in Supabase.`,
      });
    }
  }

  if (!hasData) {
    checks.push({ id: "messages", label: "Message delivery", level: "pending", detail: "No data yet." });
  } else if (failedMessages > 0) {
    const noun = failedMessages === 1 ? "message" : "messages";
    checks.push({
      id: "messages",
      label: "Message delivery",
      level: "warn",
      detail: `${failedMessages} ${noun} failed to send.`,
      cause: "Messages to sellers could not be delivered, usually a problem with the SMS or email provider or a wrong phone number. Open Messages to see which ones failed and send them again.",
    });
  } else {
    checks.push({ id: "messages", label: "Message delivery", level: "ok", detail: "No failed messages." });
  }

  return checks;
}

// The pill: one overall answer.
export function systemStatus(input = {}) {
  const { isOnline = true, hasData = false, isError = false, updatedAt = 0, failedMessages = 0, now = Date.now() } = input;

  if (!isOnline) return { level: "down", label: "Offline", detail: "No internet connection" };
  if (!hasData) {
    return isError
      ? { level: "down", label: "Unreachable", detail: "Cannot reach the server" }
      : { level: "checking", label: "Checking", detail: "Contacting the server" };
  }
  if (isError) return { level: "degraded", label: "Connection issue", detail: "Latest refresh failed" };
  if (updatedAt && now - updatedAt > STALE_AFTER_MS) {
    return { level: "degraded", label: "Delayed", detail: "Data has not refreshed recently" };
  }
  if (failedMessages > 0) {
    const noun = failedMessages === 1 ? "message" : "messages";
    return { level: "degraded", label: "Attention", detail: `${failedMessages} ${noun} failed to send` };
  }
  // Everything the numbers depend on is fine; a failing inbox or lost live connection is still worth flagging.
  const problem = buildChecks(input).find((c) => c.level === "fail" || c.level === "warn");
  if (problem) return { level: "degraded", label: "Attention", detail: `${problem.label}: ${problem.detail}` };
  return { level: "healthy", label: "Healthy", detail: "" };
}
