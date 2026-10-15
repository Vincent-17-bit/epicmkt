// Real Supabase auth: email + password, then a mandatory TOTP factor.
// Every method returns a fresh snapshot: { user, admin, aal, nextAal } (see status.js).
import { supabase } from "../lib/supabase.js";

class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const sessionIdOf = (session) => {
  try {
    const part = session?.access_token?.split(".")[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))).session_id ?? null;
  } catch {
    return null;
  }
};

async function loadAdmin(userId) {
  const { data, error } = await supabase
    .from("admins")
    .select("role, email, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new AuthError("admin_lookup_failed", "We could not check your admin access. Try again.");
  return data ? { userId, role: data.role, email: data.email, name: data.display_name } : null;
}

async function snapshot() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return { user: null, admin: null, aal: null, nextAal: null, sessionId: null };
  const user = { id: session.user.id, email: session.user.email };
  const admin = await loadAdmin(user.id);
  const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    user,
    admin,
    aal: level.data?.currentLevel ?? "aal1",
    nextAal: level.data?.nextLevel ?? "aal1",
    sessionId: sessionIdOf(session),
  };
}

async function verifiedTotp() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new AuthError("mfa_failed", "We could not load your authenticator. Try again.");
  return data.totp?.[0] ?? null; // listFactors returns verified factors only
}

export const liveAuth = {
  init: snapshot,

  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    // One message for every failure, so the form never says which half was wrong.
    if (error) throw new AuthError("bad_credentials", "That email and password do not match.");
    return snapshot();
  },

  /** Starts enrolment and returns what the person scans or types into the authenticator app. */
  async enrol() {
    // A half-finished earlier attempt blocks a new one with the same name, so clear unverified factors first.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const factor of all?.all ?? []) {
      if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "EpicMKT admin" });
    if (error) throw new AuthError("mfa_failed", "We could not start setup. Try again.");
    return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  },

  async verifyEnrol(factorId, code) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw new AuthError("bad_code", "That code did not work. Check your authenticator app and try again.");
    return snapshot();
  },

  async challenge(code) {
    const factor = await verifiedTotp();
    if (!factor) throw new AuthError("no_factor", "No authenticator is set up on this account.");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) throw new AuthError("bad_code", "That code did not work. Check your authenticator app and try again.");
    return snapshot();
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  async signOutOthers() {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) throw new AuthError("sign_out_failed", "We could not sign out your other devices. Try again.");
  },

  /** Needs public.admin_my_sessions() from supabase/migrations/0010_admin_sessions.sql. */
  async listSessions() {
    const { data, error } = await supabase.rpc("admin_my_sessions");
    if (error) throw new AuthError("sessions_failed", "We could not load your sessions.");
    return data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      lastActiveAt: row.updated_at ?? row.created_at,
      userAgent: row.user_agent,
      ip: row.ip,
    }));
  },

  /** Fires when the session changes outside this tab: token expiry, sign-out elsewhere, sign-out of other devices. */
  onChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") callback(event);
    });
    return () => data.subscription.unsubscribe();
  },
};

export { AuthError };
