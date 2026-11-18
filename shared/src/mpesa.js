// M-Pesa "Pay now" (STK Push) helpers shared by the applicant page and the seller portal.
// The server does all the money work; this only formats phone numbers and says what a request's state means on screen.

/** 2547XXXXXXXX / 2541XXXXXXXX from 07.., 01.., +254.., 254.., 7..; null otherwise. Same rule as mpesa_stk_phone in SQL. */
export function stkPhone(input) {
  const s = String(input ?? "").replace(/[^0-9+]/g, "");
  const m = s.match(/^(?:\+?254|0)?([71][0-9]{8})$/);
  return m ? `254${m[1]}` : null;
}

export const isSafaricomPhone = (input) => stkPhone(input) !== null;

/** 0712 345 678, the way Kenyans write their number. Anything unrecognised is returned as given. */
export function localPhone(input) {
  const p = stkPhone(input);
  if (!p) return String(input ?? "");
  const local = `0${p.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** How often the page asks for news while the prompt is on the phone, and how long it waits before saying so. */
export const STK_POLL_MS = 3000;
export const STK_WAIT_MS = 150_000;
/** After this long without an answer the payer is offered "Send the prompt again". */
export const STK_RESEND_AFTER_MS = 40_000;

const TITLES = {
  creating: "Sending the request to your phone",
  pending: "Check your phone",
  confirming: "Payment confirmed by Safaricom",
  paid: "Payment received",
  failed: "Payment not completed",
  expired: "No answer from your phone",
  error: "Could not send the request",
  disputed: "We are checking this payment",
};

/**
 * What a request's state means on screen.
 * tone: info | success | warning | error. waiting: keep polling. retry: offer "Try again". done: stop, nothing more to do.
 */
export function stkStage(request) {
  const status = request?.status ?? "idle";
  const tone = status === "paid" ? "success"
    : status === "failed" || status === "error" ? "error"
    : status === "expired" || status === "disputed" ? "warning"
    : "info";
  return {
    status,
    tone,
    title: TITLES[status] ?? "",
    message: request?.message ?? "",
    waiting: status === "creating" || status === "pending" || status === "confirming",
    retry: status === "failed" || status === "expired" || status === "error",
    done: status === "paid" || status === "disputed",
  };
}

/** One line for a paid request: what the money did. `day` formats the paid-until date (YYYY-MM-DD). */
export function stkOutcomeText(request, day = (d) => d) {
  const o = request?.outcome;
  if (!o) return "";
  if (o.outcome === "applied" && o.months) {
    return `${o.months} month${o.months === 1 ? "" : "s"} added${o.paidUntil ? `, paid until ${day(o.paidUntil)}` : ""}.`;
  }
  if (o.outcome === "applied") return "Your change is paid and applied.";
  if (o.outcome === "ready") return "Your page is being set up. Your login details arrive by SMS in a minute.";
  if (o.outcome === "part_paid" || o.outcome === "held") return `Received. KES ${Number(o.balance ?? 0).toLocaleString("en-KE")} more is needed.`;
  if (o.outcome === "capped") return "You are paid ahead for the longest time allowed; the rest is kept as credit.";
  if (o.outcome === "needs_assignment") return "Received. Our team is matching it to your account; you do not need to pay again.";
  return "";
}

/** Errors the start call can return that mean "use Paybill instead", not "try again". */
export const STK_FALLBACK_ERRORS = new Set(["stk_not_configured", "stk_send_failed"]);
