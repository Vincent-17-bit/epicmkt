import { closureTextProblemMessage } from "@epicmkt/shared/hours";

export const CONFLICT_TEXT = "These hours were changed on another device. Reload to continue";

export const isConflict = (e) => e?.code === "CONCURRENCY_CONFLICT" || /CONCURRENCY_CONFLICT/.test(e?.message ?? "");

export function messageProblem(e) {
  const m = /invalid_message:(\w+)/.exec(e?.message ?? "");
  return m ? m[1] : null;
}

export function messageForError(e) {
  if (isConflict(e)) return CONFLICT_TEXT;
  const problem = messageProblem(e);
  if (problem) return closureTextProblemMessage(problem) || "That message is not allowed.";
  const code = e?.code;
  if (code === "closure_in_past") return "That time has already passed.";
  if (code === "closure_too_long") return "That is longer than the allowed limit.";
  if (code === "unauthorized" || code === "not_a_seller") return "Please sign in again.";
  if (code === "invalid_hours") return "Those hours are not valid. Check the highlighted days.";
  if (code === "invalid_exceptions") return "That date could not be saved. Check the date and try again.";
  if (e?.name === "TypeError" || code === "request_failed") return "Could not reach the server. Check your connection and try again.";
  return "Something went wrong. Try again.";
}
