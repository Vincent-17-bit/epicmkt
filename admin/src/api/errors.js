const MESSAGES = {
  invalid_credentials: "Email or password is incorrect.",
  not_admin: "This account does not have admin access.",
  unauthorized: "Please sign in again.",
  forbidden: "Your role does not allow that.",
  not_found: "That record could not be found.",
  invalid_resource: "Unknown resource.",
  invalid_request: "That request is not valid.",
  network: "Could not reach the server. Check your connection and try again.",
  not_configured: "The admin API is not configured.",
  unknown: "Something went wrong. Please try again.",
};

export class ApiError extends Error {
  constructor(code, message, extra = {}) {
    super(message ?? MESSAGES[code] ?? MESSAGES.unknown);
    this.name = "ApiError";
    this.code = code;
    Object.assign(this, extra);
  }
}

// Maps a supabase-js / PostgREST error to an ApiError. Raw database messages are kept on `.cause`
// for logging and never shown to the person.
export function fromSupabase(error) {
  if (error instanceof ApiError) return error;
  const code = String(error?.code ?? "");
  const status = Number(error?.status ?? 0);
  let mapped = "unknown";
  if (error instanceof TypeError || /failed to fetch|network/i.test(String(error?.message ?? ""))) mapped = "network";
  else if (status === 401 || code === "PGRST301" || /jwt/i.test(String(error?.message ?? ""))) mapped = "unauthorized";
  else if (code === "42501" || status === 403) mapped = "forbidden";
  else if (code === "PGRST116" || code === "22P02" || status === 404) mapped = "not_found";
  const out = new ApiError(mapped);
  out.cause = error;
  return out;
}
