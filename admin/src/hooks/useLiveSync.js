import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { subscribeLive } from "../api/index.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useToast } from "../components/Toast.jsx";
import { describeNotification } from "../lib/notify.js";
import { playChime } from "../lib/sound.js";
import { useLiveStore } from "../state/liveStore.js";

/**
 * Mounted once, in the layout. Keeps counts, the dashboard and notifications fresh from Realtime, shows a soft toast
 * (and, if the person turned sound on, a chime) when a new notification arrives, and reports the connection state.
 * Realtime only says that something moved: the numbers always come from a re-read, so a missed event never leaves them wrong.
 */
export function useLiveSync() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (status !== "ready") return undefined;
    const { setConnection } = useLiveStore.getState();
    const seen = new Set();
    let timer = 0;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const key of ["admin-counts", "dashboard", "notifications"]) queryClient.invalidateQueries({ queryKey: [key] });
      }, 600); // a burst of changes becomes one re-read
    };
    const stop = subscribeLive({
      onChange: refresh,
      onStatus: setConnection,
      onNotification: (row) => {
        if (!row?.id || seen.has(row.id)) return;
        seen.add(row.id);
        if ((useLiveStore.getState().quiet[row.kind] ?? 0) > 0) return; // the open page is showing its own
        const note = describeNotification(row);
        toast.info(note.detail || note.title, { title: note.title, duration: 6000, action: { label: "View", onAction: () => navigate(note.to) } });
        if (useLiveStore.getState().soundOn) playChime();
      },
    });
    return () => { clearTimeout(timer); stop(); };
  }, [status, queryClient, toast, navigate]);
}
