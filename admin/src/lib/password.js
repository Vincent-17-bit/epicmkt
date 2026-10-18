export const MIN_PASSWORD_LENGTH = 10;

// Returns an empty string when the password is acceptable, otherwise what to fix.
// Supabase has its own minimum (Authentication > Sign In / Providers > Password); set it to 10 there too.
export function passwordProblem(password) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use both letters and numbers.";
  return "";
}

export const onlyDigits = (value) => value.replace(/\D/g, "").slice(0, 10);

// Supabase email codes are 6 to 10 digits depending on the project setting.
export const looksLikeCode = (value) => /^\d{6,10}$/.test(value);
