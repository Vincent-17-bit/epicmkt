import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { useAdminCounts, useRealtimeStatus } from "../hooks/useAdminCounts.js";
import { buildChecks, systemStatus } from "../lib/systemStatus.js";
import { timeAgo } from "../lib/time.js";

const ICON = { ok: "✓", warn: "!", fail: "✕", pending: "…", skipped: "–" };
const LEVEL_TEXT = { ok: "Passed", warn: "Warning", fail: "Failed", pending: "Checking", skipped: "Not used" };

// Sidebar status card driven by real data. Click it to open the list of checks behind the pill; every
// failing or warning check says what is wrong and what to do. Click again (or press Escape) to close it.
// It reads the same queries the sidebar badges use, so opening it costs no extra requests.
export default function SystemStatusCard({ collapsed = false, onExpand }) {
  const counts = useAdminCounts();
  const unread = useQuery({ queryKey: ["admin-unread-messages"], queryFn: () => api.getUnreadMessages(), refetchInterval: 60_000, retry: false });
  const realtime = useRealtimeStatus();

  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [rechecking, setRechecking] = useState(false);
  const toggleRef = useRef(null);
  const panelId = useId();

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

  // Keep the clock fresh the moment the card opens, so "Updated 4m ago" is not a half minute stale.
  useEffect(() => {
    if (open) setNow(Date.now());
  }, [open]);

  const hasData = counts.data !== undefined;
  const input = {
    isOnline,
    hasData,
    isError: counts.isError,
    error: counts.error,
    updatedAt: counts.dataUpdatedAt,
    failedMessages: counts.data?.failedMessages ?? 0,
    inbox: { hasData: unread.data !== undefined, isError: unread.isError, error: unread.error },
    realtime: realtime.status,
    realtimeMessage: realtime.message,
    now,
  };
  const status = systemStatus(input);
  const checks = buildChecks(input);
  const problems = checks.filter((c) => c.level === "fail" || c.level === "warn").length;
  const synced = hasData && counts.dataUpdatedAt ? timeAgo(counts.dataUpdatedAt, new Date(now)) : "";

  const recheck = async () => {
    setRechecking(true);
    setIsOnline(navigator.onLine);
    try {
      await Promise.allSettled([counts.refetch(), unread.refetch()]);
    } finally {
      setNow(Date.now());
      setRechecking(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      toggleRef.current?.focus();
    }
  };

  // The collapsed sidebar has no room for the list: show just a coloured dot that opens the sidebar.
  if (collapsed) {
    return (
      <button
        type="button"
        className={`admin-system-dot admin-system-dot--${status.level}`}
        aria-label={`System status: ${status.label}. Expand the sidebar for details.`}
        title={`System status: ${status.label}`}
        onClick={onExpand}
      />
    );
  }

  return (
    <div className={`admin-system-card ${open ? "is-open" : ""}`} onKeyDown={onKeyDown}>
      <button
        ref={toggleRef}
        type="button"
        className="admin-system-card__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="admin-system-card__title">
          System Status
          <span className="admin-system-card__chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
        </span>
        <span className="admin-system-card__content" role="status" aria-live="polite">
          <span className={`status-pill status-pill--${status.level}`}>{status.label}</span>
          {status.detail ? <span>{status.detail}</span> : null}
          <span>{synced ? `Last sync: ${synced}` : "Not synced yet"}</span>
        </span>
        <span className="admin-system-card__hint">
          {open ? "Click to close" : problems > 0 ? `${problems} ${problems === 1 ? "issue" : "issues"}: click for details` : "Click to see what is checked"}
        </span>
      </button>

      {open ? (
        <div id={panelId} className="admin-system-checks">
          <ul className="admin-system-checks__list">
            {checks.map((check) => (
              <li key={check.id} className={`admin-system-check admin-system-check--${check.level}`}>
                <span className="admin-system-check__icon" aria-hidden="true">{ICON[check.level]}</span>
                <div className="admin-system-check__body">
                  <div className="admin-system-check__label">
                    {check.label}
                    <span className="sr-only">: {LEVEL_TEXT[check.level]}</span>
                  </div>
                  <div className="admin-system-check__detail">{check.detail}</div>
                  {check.cause ? (
                    <div className="admin-system-check__cause"><strong>Cause:</strong> {check.cause}</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="admin-system-checks__recheck" onClick={recheck} disabled={rechecking}>
            {rechecking ? "Checking…" : "Check now"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
