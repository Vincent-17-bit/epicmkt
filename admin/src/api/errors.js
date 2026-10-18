// One error type for both the mock and the live API, so pages handle failures the same way in demo and live.
// `code` is a short snake_case name (see ERROR_TEXT in lib/applications.js for the ones with friendly text).

export class ApiError extends Error {
  constructor(code, message, details) {
    super(message ?? code);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

const KNOWN = ["forbidden", "not_found", "invalid_status", "unauthorized", "rate_limited"];

// Turns whatever supabase-js hands back (a PostgREST error, a storage error, a thrown Error) into an ApiError
// whose `code` the UI can describe. Technical text is kept on `cause` for the console and never shown as is.
export function toApiError(error) {
  if (error instanceof ApiError) return error;
  const message = String(error?.message ?? "");
  const code = String(error?.code ?? "");

  let mapped = "server_error";
  if (code === "42501" || /permission denied|row-level security|forbidden/i.test(message)) mapped = "forbidden";
  else if (code === "PGRST301" || /jwt (expired|invalid)|invalid jwt|not authenticated/i.test(message)) mapped = "unauthorized";
  else if (KNOWN.includes(message)) mapped = message; // RPCs `raise exception 'not_found'` etc.
  else if (error?.status === 429) mapped = "rate_limited";

  const out = new ApiError(mapped, message || mapped);
  out.cause = error;
  return out;
}
