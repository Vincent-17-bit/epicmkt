import { useEffect, useState } from "react";
import { useAdminCounts } from "../hooks/useAdminCounts.js";
import { systemStatus } from "../lib/systemStatus.js";
import { timeAgo } from "../lib/time.js";

// Sidebar status card driven by real data: the shared dashboard-counts query (same key the badges use, so it
// costs no extra request), the browser's online state, and a clock so "Last sync" keeps moving.
export default function SystemStatusCard() {
  const counts = useAdminCounts();
  const [now, setNow] = useState(() => Date.now());
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const hasData = counts.data !== undefined;
  const status = systemStatus({
    isOnline,
    hasData,
    isError: counts.isError,
    updatedAt: counts.dataUpdatedAt,
    failedMessages: counts.data?.failedMessages ?? 0,
    now,
  });
  const synced = hasData && counts.dataUpdatedAt ? timeAgo(counts.dataUpdatedAt, new Date(now)) : "";

  return (
    <div className="admin-system-card" role="status" aria-live="polite">
      <div className="admin-system-card__title">System Status</div>
      <div className="admin-system-card__content">
        <span className={`status-pill status-pill--${status.level}`}>{status.label}</span>
        {status.detail ? <span>{status.detail}</span> : null}
        <span>{synced ? `Last sync: ${synced}` : "Not synced yet"}</span>
      </div>
    </div>
  );
}
