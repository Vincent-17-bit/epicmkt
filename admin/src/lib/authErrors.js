// Turns Supabase Auth errors into short sentences an admin can act on.
export function authMessage(error, fallback = "Something went wrong. Try again.") {
  const text = String(error?.message ?? "");
  const code = String(error?.code ?? "");
  if (error?.status === 429 || /rate limit|too many|security purposes/i.test(text) || code.includes("rate_limit")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (/invalid login credentials/i.test(text)) return "That email and password do not match.";
  if (/email not confirmed/i.test(text)) return "This email is not confirmed yet. Confirm the user in Supabase, then try again.";
  if (/expired|invalid/i.test(text) && /token|otp|code|nonce/i.test(text)) return "That code is wrong or has expired. Request a new one.";
  if (/same as the old|different from the old/i.test(text)) return "Choose a password you have not used before.";
  if (/weak|pwned|known to be/i.test(text) || code === "weak_password") return "That password is too easy to guess. Choose a stronger one.";
  if (/at least \d+ characters|should be at least/i.test(text)) return text;
  if (/failed to fetch|network/i.test(text)) return "Cannot reach the server. Check your connection and try again.";
  if (/error sending|smtp|sending .*email/i.test(text)) return "The email could not be sent. Check the email settings in Supabase.";
  return fallback;
}
