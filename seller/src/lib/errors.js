const MESSAGES = {
  unauthorized: "Your session has ended. Please sign in again.",
  not_a_seller: "This account has no business listing.",
  premium_only: "This needs the Premium plan.",
  limit_reached: "You have reached the limit of 5 branches.",
  change_already_pending: "There is already a pending request for this. Cancel it first to send a new one.",
  no_change: "That is the same as the current value.",
  not_found_or_not_pending: "That request is no longer pending.",
  invalid_announcement: "The banner must be short, with no links, email addresses or phone numbers.",
  invalid_whatsapp: "Enter a Kenyan number, for example 0712 345 678.",
  invalid_phone: "Enter a Kenyan number, for example 0712 345 678.",
  invalid_email: "Enter a valid email address.",
  invalid_location: "Place the pin inside Kenya.",
  upload_failed: "The upload failed. Check your connection and try again.",
  not_configured: "The portal is not connected to a server yet.",
  request_failed: "Something went wrong. Please try again.",
};

export function errorMessage(error) {
  if (!error) return "";
  const code = error.code ?? "request_failed";
  if (MESSAGES[code]) return MESSAGES[code];
  if (code.startsWith("invalid_")) return `Check the ${code.slice(8).replace(/_/g, " ")} and try again.`;
  return error.message && error.message !== code ? error.message : MESSAGES.request_failed;
}
