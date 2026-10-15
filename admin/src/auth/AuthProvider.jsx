import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isLive } from "../lib/supabase.js";
import { liveAuth } from "./liveAuth.js";
import { mockAuth } from "./mockAuth.js";
import { deriveStatus } from "./status.js";

const adapter = isLive ? liveAuth : mockAuth;
const EMPTY = { user: null, admin: null, aal: null, nextAal: null, sessionId: null };
const IDLE_NOTICE = "You were signed out after 15 minutes without activity.";

const AuthContext = createContext(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState(null); // null until the first read finishes
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await adapter.init();
      if (!mounted.current) return;
      setSnapshot(next);
      setLoadFailed(false);
    } catch {
      if (mounted.current) setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const stop = adapter.onChange(refresh);
    return () => {
      mounted.current = false;
      stop();
    };
  }, [refresh]);

  const adopt = useCallback((next) => {
    setSnapshot(next);
    setNotice("");
    return next;
  }, []);

  const signOut = useCallback(
    async ({ reason } = {}) => {
      try {
        await adapter.signOut();
      } finally {
        setSnapshot(EMPTY);
        setNotice(reason === "idle" ? IDLE_NOTICE : "");
        // Nothing the last person saw should be left in memory for the next one.
        queryClient.clear();
      }
    },
    [queryClient],
  );

  const value = useMemo(() => {
    const status = loadFailed && !snapshot ? "error" : snapshot ? deriveStatus(snapshot) : "loading";
    return {
      status,
      user: snapshot?.user ?? null,
      admin: snapshot?.admin ?? null,
      sessionId: snapshot?.sessionId ?? null,
      notice,
      retry: refresh,
      signIn: async (email, password) => adopt(await adapter.signIn(email, password)),
      enrol: () => adapter.enrol(),
      verifyEnrol: async (factorId, code) => adopt(await adapter.verifyEnrol(factorId, code)),
      challenge: async (code) => adopt(await adapter.challenge(code)),
      signOut,
      signOutOthers: () => adapter.signOutOthers(),
      listSessions: () => adapter.listSessions(),
    };
  }, [snapshot, loadFailed, notice, refresh, adopt, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
