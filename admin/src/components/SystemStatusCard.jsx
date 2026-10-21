import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHeartPulse } from "@fortawesome/free-solid-svg-icons";
import { api } from "../api/index.js";
import { useAdminCounts, useRealtimeStatus } from "../hooks/useAdminCounts.js";
import { useDismiss } from "../hooks/useDismiss.js";
import { buildChecks, systemStatus } from "../lib/systemStatus.js";
import { timeAgo } from "../lib/time.js";

const ICON = { ok: "✓", warn: "!", fail: "✕", pending: "…", skipped: "–" };
const LEVEL_TEXT = { ok: "Passed", warn: "Warning", fail: "Failed", pending: "Checking", skipped: "Not used" };

export default function SystemStatusCard() {
  const counts = useAdminCounts();
  const unread = useQuery({ queryKey: ["admin-unread-messages"], queryFn: () => api.getUnreadMessages(), refetchInterval: 60_000, retry: false });
  const realtime = useRealtimeStatus();

  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [rechecking, setRechecking] = useState(false);
  const boxRef = useRef(null);
  const toggleRef = useRef(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(boxRef, open, close);

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

  return (
    <div ref={boxRef} className={`admin-system-card ${open ? "is-open" : ""}`} onKeyDown={onKeyDown}>
      <button
        ref={toggleRef}
        type="button"
        className="admin-health"
        aria-expanded={open}
        aria-controls={panelId}
        title={`System status: ${status.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="admin-health__icon">
          <FontAwesomeIcon icon={faHeartPulse} fixedWidth />
          <span className={`admin-health__dot admin-health__dot--${status.level}`} aria-hidden="true" />
        </span>
        <span className="admin-health__text" role="status" aria-live="polite">
          <span className="admin-health__title">System status</span>
          <span className="admin-health__meta">
            <span className={`status-pill status-pill--${status.level}`}>{status.label}</span>
            {synced ? <span>{synced}</span> : null}
          </span>
        </span>
      </button>

      {open ? (
        <div id={panelId} className="admin-system-checks">
          <div className="admin-system-checks__head">
            <span className={`status-pill status-pill--${status.level}`}>{status.label}</span>
            <span>{status.detail || (problems > 0 ? `${problems} ${problems === 1 ? "issue" : "issues"}` : "All checks passed")}</span>
            <span className="admin-system-checks__sync">{synced ? `Last sync: ${synced}` : "Not synced yet"}</span>
          </div>
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
