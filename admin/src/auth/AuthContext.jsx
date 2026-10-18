import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { configError, isLive, supabase } from "../lib/supabaseClient.js";

const AuthContext = createContext(null);

const DEMO_ADMIN = { userId: "demo", role: "owner", email: null, displayName: "Demo admin" };
const IDLE = { userId: null, state: "idle", admin: null, message: null };

// status: loading | signedOut | admin | error
// "admin" means a Supabase session exists AND this user has a row in public.admins.
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [sessionReady, setSessionReady] = useState(!supabase);
  const [adminState, setAdminState] = useState(IDLE);
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);

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

  useEffect(() => {
    if (!supabase || !userId) {
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
  }, [userId, userEmail, attempt]);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) return { error: new Error(configError ?? "Supabase is not configured.") };
    setDenied(false);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ?? null };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut({ scope: "local" });
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(() => {
    let status;
    if (!isLive) status = "admin";
    else if (!supabase) status = "signedOut";
    else if (!sessionReady) status = "loading";
    else if (!userId) status = "signedOut";
    else if (adminState.userId !== userId) status = "loading";
    else if (adminState.state === "ok") status = "admin";
    else if (adminState.state === "error") status = "error";
    else status = "loading";

    return {
      status,
      admin: isLive ? adminState.admin : DEMO_ADMIN,
      demo: !isLive,
      denied,
      errorMessage: adminState.message,
      configError,
      signIn,
      signOut,
      retry,
    };
  }, [sessionReady, userId, adminState, denied, signIn, signOut, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
