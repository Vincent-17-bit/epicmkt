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
  already_decided: "Someone has already decided this request. Reload to see the result.",
  invalid_category: "That category is no longer available, so the change cannot be approved.",
  invalid_field: "This kind of change cannot be applied.",
  invalid_state: "That filter is not recognised.",
  invalid_range: "The end date must be after the start date.",
  plans_not_priced: "Set a price on both plans (Plans page) before switching this category on.",
  plan_not_found: "That plan no longer exists.",
  invalid_price: "Enter a whole price between 0 and 100,000.",
  invalid_badge: "Choose a badge from the list.",
  three_benefits_required: "Write exactly three benefits.",
  invalid_benefit: "Each benefit must be 2 to 80 characters.",
  invalid_id: "The id uses lower-case letters, numbers and dashes (2 to 50 characters).",
  invalid_tier: "Choose a tier from A to D.",
  invalid_template: "The questions are not in a valid format. Check each question.",
  invalid_docs: "The documents are not in a valid format. Check each document.",
  options_required: "Choice questions need between 2 and 30 choices.",
  invalid_condition: "A question depends on a question that does not exist.",
  duplicate_field_key: "Two questions share a key.",
  invalid_field_key: "A question has an invalid key.",
  invalid_field_label: "Every question needs a label of up to 80 characters.",
  condition_required: "A conditional document needs a condition.",
  invalid_channel: "Choose SMS, email or in-app.",
  not_failed: "That message is not in a failed state.",
  invalid_key: "Template keys use lower-case letters, numbers, dots, dashes and underscores (2 to 60 characters).",
  sms_too_long: "SMS can be at most 612 characters.",
  subject_required: "Email needs a subject.",
  channel_locked: "A template's channel cannot be changed after it is created. Create a new template instead.",
  cron_not_installed: "The scheduler (pg_cron) is not installed on this project.",
  job_not_scheduled: "That job is not scheduled. Run supabase/cron/schedule.sql first.",
  unknown_job: "That is not one of this app's jobs.",
  automation_not_configured: "Run now needs the project_url and cron_secret secrets in Vault. See docs/cron-runbook.md.",
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
