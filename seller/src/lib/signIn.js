// How far a seller is through "set up your own sign-in". We send a Seller ID and a temporary password first. The seller
// then adds their own email and chooses their own password, and from then on can sign in with the email or the Seller ID.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value) => EMAIL_PATTERN.test(String(value ?? "").trim());

export function signInSetup(business) {
  const needsEmail = !business?.loginEmailVerified;
  const needsPassword = !!business?.mustChangePassword;
  return { needsEmail, needsPassword, done: !needsEmail && !needsPassword };
}

export const PASSWORD_HINT = "At least 10 characters, with an uppercase letter, a lowercase letter and a number.";
