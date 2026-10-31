// Plain-language copy for a failed load: what went wrong and what the admin can do about it.
// Pure function, no browser or Supabase, so it is easy to test.

const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out/i;

export function describeLoadError(error) {
  const code = error?.code;
  const raw = String(error?.cause?.message ?? error?.message ?? "").trim();
  if (code === "unauthorized") return { problem: "Your sign-in has expired.", fix: "Sign out, then sign in again.", detail: "" };
  if (code === "forbidden") return { problem: "This account can't view this.", fix: "Ask an owner to check your role.", detail: "" };
  if (code === "rate_limited") return { problem: "Too many requests were sent.", fix: "Wait a minute, then try again.", detail: "" };
  if (NETWORK_FAILURE.test(raw)) return { problem: "We couldn't reach the server.", fix: "Check your internet connection, then try again.", detail: "" };
  return {
    problem: "The server returned an error.",
    fix: "Try again. If it keeps happening, check the Supabase logs.",
    detail: raw && !/^[a-z_]+$/.test(raw) ? raw.slice(0, 160) : "",
  };
}
