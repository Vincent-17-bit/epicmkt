import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isLive } from "../api/flash/mode.js";
import { invalidateSnapshot } from "../api/flash/snapshot.js";
import { invalidateFlash } from "../lib/flashSync.js";

const CHANNEL = "epicmkt-flash";
const FALLBACK_POLL_MS = 30_000;
const SAFETY_POLL_MS = 120_000;
const DEBOUNCE_MS = 250;
const WAKE = ["focus", "online", "pageshow"];

export function useFlashRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let channel = null;
    let stopRealtime = null;
    let debounce = null;
    let poll = null;
    let connected = false;
    let closed = false;

    const refresh = () => {
      invalidateSnapshot();
      invalidateFlash(queryClient);
    };

    const refreshSoon = (announce) => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        refresh();
        if (announce) channel?.postMessage("refresh");
      }, DEBOUNCE_MS);
    };

    const startPolling = () => {
      window.clearInterval(poll);
      poll = window.setInterval(() => {
        if (document.visibilityState === "visible") refresh();
      }, connected ? SAFETY_POLL_MS : FALLBACK_POLL_MS);
    };

    const wake = () => {
      if (document.visibilityState === "visible") refreshSoon(false);
    };

    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = () => refreshSoon(false);
    }
    WAKE.forEach((name) => window.addEventListener(name, wake));
    document.addEventListener("visibilitychange", wake);
    startPolling();

    if (isLive()) {
      import("../api/flash/live.js")
        .then(({ subscribe }) => {
          if (closed) return;
          stopRealtime = subscribe(
            () => refreshSoon(true),
            (status) => {
              const next = status === "SUBSCRIBED";
              if (next === connected) return;
              connected = next;
              startPolling();
              if (next) refreshSoon(false);
            }
          );
        })
        .catch(() => {});
    }

    return () => {
      closed = true;
      window.clearTimeout(debounce);
      window.clearInterval(poll);
      WAKE.forEach((name) => window.removeEventListener(name, wake));
      document.removeEventListener("visibilitychange", wake);
      channel?.close();
      stopRealtime?.();
    };
  }, [queryClient]);
}
