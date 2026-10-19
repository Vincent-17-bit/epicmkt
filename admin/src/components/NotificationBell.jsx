import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faCheckDouble } from "@fortawesome/free-solid-svg-icons";
import { api } from "../api/index.js";
import { useDismiss } from "../hooks/useDismiss.js";
import { describeActivity } from "../lib/activity.js";
import { describeError } from "../lib/systemStatus.js";
import { badgeText } from "../lib/counts.js";
import { timeAgo } from "../lib/time.js";

const COUNT_KEY = ["admin-notifications", "unread"];
const LIST_KEY = ["admin-notifications", "list"];

// The bell: a badge with the number of unread notifications, and a list of the latest ones. Clicking one marks
// it read and opens the screen it is about. Everything here is real data from admin_notifications.
export default function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const buttonRef = useRef(null);

  const count = useQuery({ queryKey: COUNT_KEY, queryFn: () => api.getUnreadNotificationCount(), refetchInterval: 60_000, retry: false });
  const list = useQuery({ queryKey: LIST_KEY, queryFn: () => api.getNotifications(), enabled: open, refetchInterval: open ? 30_000 : false, retry: false });

  const close = useCallback(() => setOpen(false), []);
  useDismiss(boxRef, open, close);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
  const mark = useMutation({ mutationFn: (ids) => api.markNotificationsRead(ids), onSuccess: refresh });

  const unread = count.data ?? 0;
  const badge = badgeText(unread);
  const rows = list.data ?? [];

  const openRow = (row) => {
    const { to } = describeActivity(row);
    if (!row.read) mark.mutate([row.id]);
    setOpen(false);
    if (to) navigate(to);
  };

  return (
    <div className="admin-bell" ref={boxRef}>
      <button
        ref={buttonRef}
        type="button"
        className="admin-icon-button admin-bell__button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <FontAwesomeIcon icon={faBell} />
        {badge ? <span className="admin-bell__badge" aria-hidden="true">{badge}</span> : null}
      </button>

      {open ? (
        <div className="admin-bell__panel" role="region" aria-label="Notifications">
          <div className="admin-bell__head">
            <strong>Notifications</strong>
            <button type="button" className="admin-bell__markall" disabled={unread === 0 || mark.isPending} onClick={() => mark.mutate(undefined)}>
              <FontAwesomeIcon icon={faCheckDouble} /> Mark all read
            </button>
          </div>

          {list.isError ? (
            <div className="admin-bell__empty" role="alert">
              <strong>{describeError(list.error).title}.</strong> {describeError(list.error).cause}
              <div><button type="button" className="admin-bell__markall" onClick={() => list.refetch()}>Try again</button></div>
            </div>
          ) : list.isLoading ? (
            <div className="admin-bell__empty">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="admin-bell__empty">You are all caught up. New activity from sellers and applicants shows here.</div>
          ) : (
            <ul className="admin-bell__list">
              {rows.map((row) => {
                const { text, to } = describeActivity(row);
                return (
                  <li key={row.id}>
                    <button type="button" className={`admin-bell__item ${row.read ? "" : "is-unread"}`} onClick={() => openRow(row)} title={to ? "Open" : undefined}>
                      <span className="admin-bell__dot" aria-hidden="true" />
                      <span className="admin-bell__text">
                        {text}
                        {row.read ? null : <span className="sr-only"> (unread)</span>}
                        <span className="admin-bell__time">{timeAgo(row.at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
