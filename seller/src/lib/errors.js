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
  invalid_date: "Choose a valid date.",
  date_in_past: "Choose today or a later date. Past dates cannot be added.",
  date_too_far: "Choose a date within the next 2 years.",
  date_taken: "You already have an exception on that date. Edit it instead.",
  invalid_kind: "Choose Closed all day or Special hours.",
  intervals_required: "Add at least one opening interval, or choose Closed all day.",
  too_many_intervals: "You can add up to 3 intervals for a day.",
  invalid_time: "Enter each time as hours and minutes.",
  interval_order: "Each interval must end after it starts.",
  intervals_overlap: "Intervals cannot overlap or touch. Merge them into one.",
  invalid_note: "Keep the note to 120 characters of plain text.",
  limit_reached: "You have reached the limit of 60 upcoming exceptions. Delete one you no longer need, then try again.",
  invalid_discount: "Enter a valid discount: 1 to 99 percent, or an amount above 0.",
  discount_too_large: "That discount would make the price zero. Use a smaller discount.",
  sale_price_not_lower: "The sale price must be lower than the regular price.",
  item_not_discountable: "Flash sales need an item with a fixed or starting price.",
  item_unavailable: "This item is hidden or out of stock, so it cannot go on sale.",
  item_not_found: "Choose one of your items.",
  item_has_sale: "This item already has a flash sale in that time.",
  invalid_window: "Choose an end time after the start.",
  ends_in_past: "Choose an end time in the future.",
  duration_too_long: "A flash sale can run for 7 days at most.",
  invalid_headline: "Keep the headline between 3 and 80 characters of plain text.",
  invalid_after_end: "Choose what happens to the item when the sale ends.",
  flash_closed: "This sale has already ended.",
  flash_locked: "A sale that has started can only change its headline and note.",
  business_not_active: "Your listing is not active, so you cannot start a flash sale.",
  not_found: "We could not find that flash sale.",
  invalid_action: "That action is not available.",
  no_items: "Choose at least one item.",
  too_many_items: "Choose at most 500 items at a time.",
  invalid_section: "Keep the section name to 60 characters.",
  invalid_availability: "Choose a valid availability.",
  invalid_percent: "Enter a percentage from -90 to 300, other than 0.",
  price_too_large: "That change would make a price too large. Nothing was changed.",
  premium_required: "Paste and CSV import is part of the Premium plan.",
  no_rows: "There are no rows to import.",
  too_many_rows: "Import at most 500 rows at a time.",
  formula_rejected: "A cell starts with = + - or @. Remove that character and try again.",
  too_many_views: "You can save at most 10 views. Delete one first.",
  invalid_view: "Use a name of up to 30 letters, numbers and spaces.",
  duplicate_view: "You already have a view with that name.",
  invalid_item: "Check the item details and try again.",
  ...PROOF_ERRORS,
};

const LIMITS = {
  items: "You have reached the number of items your plan allows. Delete one or upgrade your plan.",
  flash_concurrent: "You have reached the number of flash sales you can run at the same time on your plan.",
  flash_per_month: "You have used all the flash sales your plan allows this month.",
};
export const errorText = (e, fallback = "Something went wrong. Check your connection and try again.") => {
  if (e?.code === "limit_reached") {
    const key = String(e.message ?? "").split(":")[1] ?? "items";
    if (LIMITS[key]) return LIMITS[key];
    if (!e.message) return LIMITS.items;
  }
  return MESSAGES[e?.code] ?? fallback;
};
