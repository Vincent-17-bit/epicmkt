import { isRole } from "./permissions.js";

/**
 * Where the person is in the sign-in flow, from a snapshot of the session:
 *   { user: {id, email} | null, admin: {role, ...} | null, aal: "aal1" | "aal2" | null, nextAal: "aal1" | "aal2" | null }
 *
 *  signed_out       no session
 *  no_access        signed in, but there is no admins row (or an unknown role)
 *  needs_enrol      admin, no verified authenticator yet
 *  needs_challenge  admin with an authenticator, this session has not passed it
 *  ready            admin, session is at aal2
 *
 * Admin access is checked before MFA so a non-admin is never walked through enrolment.
 */
export function deriveStatus(snapshot) {
  if (!snapshot?.user) return "signed_out";
  if (!snapshot.admin || !isRole(snapshot.admin.role)) return "no_access";
  if (snapshot.aal === "aal2") return "ready";
  return snapshot.nextAal === "aal2" ? "needs_challenge" : "needs_enrol";
}
