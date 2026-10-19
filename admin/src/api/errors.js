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

// Errors the message and bulk-action functions raise, with text an admin can act on.
export const ACTION_TEXT = {
  reason_required: "A reason of at least 5 characters is required.",
  invalid_input: "Check the form and try again.",
  not_supported: "That action is not available yet.",
  too_many_recipients: "Choose 500 businesses or fewer at a time.",
  body_required: "Write a message or attach a file.",
  body_too_long: "Keep the message to 4000 characters.",
  invalid_subject: "Keep the subject to 150 characters.",
  message_not_found: "That message no longer exists.",
  file_not_uploaded: "A file did not upload. Attach it again.",
  type_not_allowed: "Only JPG, PNG, WebP and PDF files can be sent.",
  file_too_large: "Each file must be 8 MB or smaller.",
  too_many_files: "You can attach up to 3 files.",
  invalid_attachment_path: "A file could not be attached. Attach it again.",
  invalid_attachment_name: "A file name is not valid.",
  attachments_limit: "You can attach up to 3 files.",
};

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
  else if (ACTION_TEXT[message]) mapped = message;
  else if (error?.status === 429) mapped = "rate_limited";

  const out = new ApiError(mapped, ACTION_TEXT[mapped] ?? (message || mapped));
  out.cause = error;
  return out;
}
