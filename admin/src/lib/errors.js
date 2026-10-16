// Turns the short codes the database raises into words an admin can act on.
const MESSAGES = {
  forbidden: "Your role is not allowed to do this.",
  reason_required: "A reason of 3 to 300 characters is required.",
  invalid_status: "This business is not in a state where that action applies. Refresh and check its status.",
  invalid_args: "Some of the details are not valid. Check the form and try again.",
  invalid_action: "That action is not available.",
  invalid_selection: "Select between 1 and 200 businesses.",
  not_found: "That business no longer exists.",
  too_many_tags: "A business can have at most 10 tags.",
  unknown_agent: "That agent is not an admin.",
  subject_required: "Add a subject for in-app and email messages.",
  no_email: "This business has no email address on file.",
  sms_too_long: "An SMS can be at most 480 characters.",
  invalid_tab: "That tab is not available.",
  invalid_sort: "That sort is not available.",
};

export function errorMessage(error) {
  const key = error?.message in MESSAGES ? error.message : error?.code in MESSAGES ? error.code : null;
  if (key) return MESSAGES[key];
  if (error?.code === "42501") return MESSAGES.forbidden;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "You are offline. Reconnect and try again.";
  return "Something went wrong. Try again in a moment.";
}
