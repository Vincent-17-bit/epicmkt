import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { supabase } from "../lib/supabaseClient.js";

export const COUNTS_KEY = ["admin-counts"];
const REFRESH_MS = 60_000;

// The one source of numbers for the sidebar badges, the Command Center and the queue tabs. They all use the
// same query key, so React Query makes a single request and every screen shows the same figures.
export function useAdminCounts() {
  return useQuery({
    queryKey: COUNTS_KEY,
    queryFn: () => api.getAdminCounts(),
    refetchInterval: REFRESH_MS,
    placeholderData: (previous) => previous, // keep showing the last numbers while a refresh runs
  });
}

// Live mode only: when an application, payment or flag changes, refresh the numbers and the queue straight away
// instead of waiting for the next poll. Realtime respects row-level security, so each admin only hears about rows
// they may read. If realtime is unavailable the 60 second poll above still keeps everything current.
export function useLiveRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return undefined;

    let timer = null;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: COUNTS_KEY });
        queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
        queryClient.invalidateQueries({ queryKey: ["admin-application"] });
        queryClient.invalidateQueries({ queryKey: ["admin-activity"] });
        queryClient.invalidateQueries({ queryKey: ["business-table"] });
        queryClient.invalidateQueries({ queryKey: ["admin-messages"] });
        queryClient.invalidateQueries({ queryKey: ["admin-unread-messages"] });
      }, 400); // a burst of changes becomes one refresh
    };

    let channel = null;
    try {
      channel = supabase.channel("admin-live");
      for (const table of ["applications", "payments", "flags", "admin_notifications", "audit_log", "businesses", "messages", "message_attachments"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
      }
      channel.subscribe();
    } catch {
      channel = null;
    }

    return () => {
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
