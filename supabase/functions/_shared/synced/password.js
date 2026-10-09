export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const PASSWORD_MESSAGES = {
  too_short: `Use at least ${PASSWORD_MIN} characters.`,
  too_long: `Use at most ${PASSWORD_MAX} characters.`,
  no_upper: "Add an uppercase letter.",
  no_lower: "Add a lowercase letter.",
  no_number: "Add a number.",
  is_seller_id: "Your password cannot be your Seller ID.",
  is_phone: "Your password cannot be your phone number.",
};

const digits = (value) => String(value ?? "").replace(/\D/g, "");

const phoneForms = (phone) => {
  const d = digits(phone);
  if (d.length < 9) return [];
  const local = d.slice(-9);
  return [d, local, `0${local}`, `254${local}`];
};

export function passwordProblems(password, { sellerId, phone } = {}) {
  const p = String(password ?? "");
  const problems = [];
  if (p.length < PASSWORD_MIN) problems.push("too_short");
  if (p.length > PASSWORD_MAX) problems.push("too_long");
  if (!/[A-Z]/.test(p)) problems.push("no_upper");
  if (!/[a-z]/.test(p)) problems.push("no_lower");
  if (!/[0-9]/.test(p)) problems.push("no_number");
  if (sellerId && p.trim().toLowerCase() === String(sellerId).trim().toLowerCase()) problems.push("is_seller_id");
  if (phone && phoneForms(phone).includes(digits(p))) problems.push("is_phone");
  return problems;
}

export const isStrongPassword = (password, context) => passwordProblems(password, context).length === 0;
