import { PROOF_ERRORS } from "@epicmkt/shared";

const MESSAGES = {
  invalid_code_format: "Enter the 10 character M-Pesa code from your SMS (letters and numbers only).",
  code_already_used: "That M-Pesa code has already been used. Check the code in your SMS.",
  payment_already_submitted: "You already have a payment waiting for confirmation.",
  nothing_to_pay: "There is nothing to pay for this change.",
  renew_first: "Renew your subscription first, then try again.",
  invalid_upgrade: "This upgrade is not available for your plan.",
  invalid_category: "Choose a category from the list.",
  change_already_pending: "You already have a pending change for this field.",
  change_not_found: "We could not find that change request.",
  not_found_or_not_open: "This question is no longer open.",
  flag_not_found: "We could not find that question.",
  flag_not_open: "This question is no longer open.",
  attachments_pending: "Your files are still being checked. Wait a moment and try again.",
  rate_limited: "Too many tries. Please wait a while and try again.",
  invalid_credentials: "Seller ID or password is incorrect.",
  locked: "Too many tries. Please wait and try again.",
  unauthorized: "Please sign in again.",
  ...PROOF_ERRORS,
};

export const errorText = (e, fallback = "Something went wrong. Check your connection and try again.") => MESSAGES[e?.code] ?? fallback;
