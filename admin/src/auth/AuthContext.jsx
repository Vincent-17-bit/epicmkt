import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { configError, isLive, supabase } from "../lib/supabaseClient.js";
import { mfaStage } from "./mfa.js";

const AuthContext = createContext(null);

const DEMO_ADMIN = { userId: "demo", role: "owner", email: null, displayName: "Demo admin" };
const IDLE = { userId: null, state: "idle", admin: null, message: null };
const NOT_CONFIGURED = { error: new Error(configError ?? "Supabase is not configured.") };
const NO_AAL = { userId: null, current: null, next: null, failed: false };

// status: loading | signedOut | recovering | needsEnrol | needsChallenge | admin | error
// "admin" means a Supabase session exists, this user has a row in public.admins, AND the session has passed
// the authenticator (TOTP) step. "needsEnrol" = admin without an authenticator yet; "needsChallenge" = admin with
// one, but this session has not entered a code yet.
// "recovering" means the person proved their email with a reset code and must now choose a new
// password: they are NOT let into the admin until that is done.
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [sessionReady, setSessionReady] = useState(!supabase);
  const [adminState, setAdminState] = useState(IDLE);
  const [denied, setDenied] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [aal, setAal] = useState(NO_AAL);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
        setSessionReady(true);
      })
      .catch(() => {
        if (active) setSessionReady(true);
      });

    // Keep this callback synchronous: calling other Supabase methods inside it can deadlock supabase-js.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next ?? null);
      setSessionReady(true);
      if (event === "SIGNED_OUT") queryClient.clear();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const userId = session?.user?.id ?? null;
  const userEmail = session?.user?.email ?? null;
  const accessToken = session?.access_token ?? null;

  // The assurance level says whether this session has passed the authenticator. It is re-read whenever the token
  // changes (after a code is verified, and on every hourly refresh), but the last answer stays on screen meanwhile.
  const readAal = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal({ userId, current: data?.currentLevel ?? null, next: data?.nextLevel ?? null, failed: Boolean(error) });
  }, [userId]);

  useEffect(() => {
    if (!supabase || !userId || recovering || adminState.state !== "ok" || adminState.userId !== userId) return;
    readAal();
  }, [accessToken, userId, recovering, adminState, readAal]);

  useEffect(() => {
    if (!supabase || !userId || recovering) {
      setAdminState(IDLE);
      return undefined;
    }
    let active = true;
    setAdminState({ userId, state: "loading", admin: null, message: null });

    supabase
      .from("admins")
      .select("user_id, role, email, display_name")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAdminState({ userId, state: "error", admin: null, message: error.message });
          return;
        }
        if (!data) {
          // Signed in, but not an admin (a seller or a stray account): do not keep the session.
          setDenied(true);
          setAdminState({ userId, state: "none", admin: null, message: null });
          supabase.auth.signOut({ scope: "local" });
          return;
        }
        setAdminState({
          userId,
          state: "ok",
          message: null,
          admin: {
            userId: data.user_id,
            role: data.role,
            email: data.email ?? userEmail,
            displayName: data.display_name,
          },
        });
      });

    return () => {
      active = false;
    };
  }, [userId, userEmail, attempt, recovering]);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) return NOT_CONFIGURED;
    setDenied(false);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ?? null };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut({ scope: "local" });
  }, []);

  // ---- Forgot password: email -> code -> new password -> sign in again --------------------------------
  const sendRecoveryCode = useCallback(async (email) => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    return { error: error ?? null };
  }, []);

  const verifyRecoveryCode = useCallback(async (email, code) => {
    if (!supabase) return NOT_CONFIGURED;
    setDenied(false);
    setRecovering(true); // before the session appears, so the admin lookup never runs half-way
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "recovery" });
    if (error) {
      setRecovering(false);
      return { error };
    }
    return { error: null };
  }, []);

  const cancelRecovery = useCallback(async () => {
    if (supabase) await supabase.auth.signOut({ scope: "local" });
    setRecovering(false);
  }, []);

  const finishRecovery = useCallback(async (password) => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error };
    // A forgotten password may mean someone else has a session: end all of them, then sign in fresh.
    await supabase.auth.signOut({ scope: "global" });
    setRecovering(false);
    return { error: null };
  }, []);

  // ---- Change password while signed in: code to the account email, then the new password --------------
  const sendChangeCode = useCallback(async () => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.reauthenticate();
    return { error: error ?? null };
  }, []);

  const changePassword = useCallback(async (password, code) => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.updateUser({ password, nonce: code });
    if (error) return { error };
    await supabase.auth.signOut({ scope: "others" }); // other devices must sign in again
    return { error: null };
  }, []);

  // ---- Authenticator app (TOTP): set up once, then a code on every sign-in -----------------------------
  const enrolTotp = useCallback(async () => {
    if (!supabase) return NOT_CONFIGURED;
    // A half-finished earlier attempt blocks a new one with the same name, so clear unverified factors first.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const factor of all?.all ?? []) {
      if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "EpicMKT admin" });
    if (error) return { error };
    return { error: null, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }, []);

  const verifyEnrol = useCallback(async (factorId, code) => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) return { error };
    await readAal();
    return { error: null };
  }, [readAal]);

  const challengeTotp = useCallback(async (code) => {
    if (!supabase) return NOT_CONFIGURED;
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) return { error: listError };
    const factor = factors?.totp?.[0]; // listFactors returns verified factors only
    if (!factor) return { error: new Error("No authenticator is set up on this account.") };
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) return { error };
    await readAal();
    return { error: null };
  }, [readAal]);

  // ---- Where am I signed in -------------------------------------------------------------------------
  const listSessions = useCallback(async () => {
    if (!supabase) return { error: NOT_CONFIGURED.error, sessions: [] };
    const { data, error } = await supabase.rpc("admin_my_sessions");
    if (error) return { error, sessions: [] };
    return {
      error: null,
      sessions: (data ?? []).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        lastActiveAt: row.updated_at ?? row.created_at,
        userAgent: row.user_agent,
        ip: row.ip,
      })),
    };
  }, []);

  const signOutOthers = useCallback(async () => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.signOut({ scope: "others" });
    return { error: error ?? null };
  }, []);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
    setAal(NO_AAL);
  }, []);

  const value = useMemo(() => {
    let status;
    if (!isLive) status = "admin";
    else if (!supabase) status = "signedOut";
    else if (!sessionReady) status = "loading";
    else if (!userId) status = "signedOut";
    else if (recovering) status = "recovering";
    else if (adminState.userId !== userId) status = "loading";
    else if (adminState.state === "ok") {
      if (aal.userId !== userId) status = "loading";
      else if (aal.failed) status = "error";
      else {
        const stage = mfaStage({ currentLevel: aal.current, nextLevel: aal.next });
        status = stage === "ready" ? "admin" : stage;
      }
    } else if (adminState.state === "error") status = "error";
    else status = "loading";

    return {
      status,
      admin: isLive ? adminState.admin : DEMO_ADMIN,
      demo: !isLive,
      denied,
      errorMessage: adminState.message ?? (aal.failed ? "We could not check your authenticator step." : null),
      configError,
      signIn,
      signOut,
      sendRecoveryCode,
      verifyRecoveryCode,
      cancelRecovery,
      finishRecovery,
      sendChangeCode,
      changePassword,
      enrolTotp,
      verifyEnrol,
      challengeTotp,
      listSessions,
      signOutOthers,
      retry,
    };
  }, [
    sessionReady, userId, recovering, adminState, denied, aal,
    signIn, signOut, sendRecoveryCode, verifyRecoveryCode, cancelRecovery, finishRecovery,
    sendChangeCode, changePassword, enrolTotp, verifyEnrol, challengeTotp, listSessions, signOutOthers, retry,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
