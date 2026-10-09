import { PASSWORD_MESSAGES, PASSWORD_MIN, passwordProblems } from "@epicmkt/shared";

export const SELLER_ID_PATTERN = /^ES\d{6}$/;
export const normalizeSellerId = (value) => String(value ?? "").trim().toUpperCase();
export const maskPhone = (phone) => String(phone ?? "").replace(/^(\+254\d)\d{5}(\d{3})$/, "$1*****$2");

const RULES = [
  { key: "too_short", label: `At least ${PASSWORD_MIN} characters` },
  { key: "no_upper", label: "An uppercase letter" },
  { key: "no_lower", label: "A lowercase letter" },
  { key: "no_number", label: "A number" }
];

export function passwordChecklist(password, context) {
  const problems = new Set(passwordProblems(password, context));
  const items = RULES.map((r) => ({ ...r, ok: !problems.has(r.key) }));
  ["is_seller_id", "is_phone"].forEach((key) => {
    if (problems.has(key)) items.push({ key, label: PASSWORD_MESSAGES[key], ok: false });
  });
  return items;
}

export function passwordStrength(password, context) {
  const p = String(password ?? "");
  if (!p) return { level: 0, label: "" };
  const checks = passwordChecklist(p, context);
  const met = checks.filter((c) => c.ok).length;
  const bonus = (p.length >= 14 ? 1 : 0) + (/[^A-Za-z0-9]/.test(p) ? 1 : 0);
  const blocked = checks.some((c) => !c.ok);
  const level = blocked ? Math.min(2, Math.max(1, Math.ceil(met / 2))) : Math.min(4, 3 + (bonus >= 2 ? 1 : 0));
  return { level, label: ["", "Weak", "Fair", "Good", "Strong"][level] };
}

export const formatCountdown = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
