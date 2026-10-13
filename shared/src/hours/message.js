export const MESSAGE_MAX = 80;
export const LABEL_MAX = 40;

const LINK = /(https?:\/\/|www\.|(^|[^a-z0-9-])[a-z0-9][a-z0-9-]*\.(com|co\.ke|ke|org|net|io|me|ly|ee|gl|app|shop|store|info|site|online|xyz|link|dev|biz|ug|tz)($|[^a-z0-9]))/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const BETWEEN_DIGITS = /(\d)[\s().-]+(?=\d)/g;
const LONG_NUMBER = /\d{9,}/;

export const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export function closureTextProblem(value, max = MESSAGE_MAX) {
  const text = cleanText(value);
  if (!text) return null;
  if ([...text].length > max) return "too_long";
  if (LINK.test(text)) return "link";
  if (EMAIL.test(text)) return "email";
  if (LONG_NUMBER.test(text.replace(BETWEEN_DIGITS, "$1"))) return "phone";
  return null;
}

export const closureTextProblemMessage = (code, max = MESSAGE_MAX) =>
  ({
    too_long: `Keep this to ${max} characters or fewer.`,
    link: "Links are not allowed here. Remove the web address.",
    email: "Email addresses are not allowed here. Remove the email.",
    phone: "Phone numbers are not allowed here. Customers can already call you from your listing."
  })[code] ?? "";

export function validateClosureMessage(value, max = MESSAGE_MAX) {
  const code = closureTextProblem(value, max);
  return { ok: code === null, code, message: code ? closureTextProblemMessage(code, max) : "", text: cleanText(value) };
}
