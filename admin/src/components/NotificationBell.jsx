import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faCheck, faCheckDouble } from "@fortawesome/free-solid-svg-icons";
import { api } from "../api/index.js";
import { useDismiss } from "../hooks/useDismiss.js";
import { describeActivity } from "../lib/activity.js";
import { describeError } from "../lib/systemStatus.js";
import { badgeText } from "../lib/counts.js";
import { bellMessages } from "../lib/bellMessages.js";
import { timeAgo } from "../lib/time.js";

const COUNT_KEY = ["admin-notifications", "unread"];
const LIST_KEY = ["admin-notifications", "list"];
// Same keys the Messages page and the sidebar use, so all three share one cache.
const MESSAGES_KEY = ["admin-messages"];
const UNREAD_MESSAGES_KEY = ["admin-unread-messages"];

// The bell: a badge with everything unread, and two lists: seller messages and activity. Clicking a message opens
// it in Messages (on that business, with the message in view). Clicking an activity note opens the screen it is
// about. Either way it is marked read, and each row also has a "Mark read" button for reading it later.
export default function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const buttonRef = useRef(null);

  const count = useQuery({ queryKey: COUNT_KEY, queryFn: () => api.getUnreadNotificationCount(), refetchInterval: 60_000, retry: false });
  // Only unread notes are listed. A note that has been opened is read, so it leaves the bell.
  const list = useQuery({ queryKey: LIST_KEY, queryFn: () => api.getNotifications({ limit: 50, unreadOnly: true }), refetchInterval: open ? 30_000 : 60_000, retry: false });

  const messageCount = useQuery({ queryKey: UNREAD_MESSAGES_KEY, queryFn: () => api.getUnreadMessages(), refetchInterval: 60_000, retry: false });
  const messageList = useQuery({ queryKey: MESSAGES_KEY, queryFn: () => api.listMessages(), refetchInterval: open ? 30_000 : 60_000, retry: false, enabled: open || (messageCount.data ?? 0) > 0 });

  const close = useCallback(() => setOpen(false), []);
  useDismiss(boxRef, open, close, buttonRef);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
  // Optimistic: the note disappears and the badge drops at once; if saving fails, both come back.
  const mark = useMutation({
    mutationFn: (ids) => api.markNotificationsRead(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ["admin-notifications"] });
      const previousList = queryClient.getQueryData(LIST_KEY);
      const previousCount = queryClient.getQueryData(COUNT_KEY);
      const all = !Array.isArray(ids);
      const removed = (previousList ?? []).filter((row) => all || ids.includes(row.id)).length;
      queryClient.setQueryData(LIST_KEY, (rows) => (rows ?? []).filter((row) => !all && !ids.includes(row.id)));
      queryClient.setQueryData(COUNT_KEY, (n) => (all ? 0 : Math.max(0, (n ?? 0) - removed)));
      return { previousList, previousCount };
    },
    onError: (_error, _ids, context) => {
      queryClient.setQueryData(LIST_KEY, context?.previousList);
      queryClient.setQueryData(COUNT_KEY, context?.previousCount);
    },
    onSettled: refresh,
  });

  // Messages: mark by id. The row leaves the bell and the badge drops at once; if saving fails both come back.
  const markMessages = useMutation({
    mutationFn: (ids) => api.markMessagesRead({ ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: MESSAGES_KEY });
      const previousMessages = queryClient.getQueryData(MESSAGES_KEY);
      const previousCount = queryClient.getQueryData(UNREAD_MESSAGES_KEY);
      const at = new Date().toISOString();
      const hit = (previousMessages ?? []).filter((m) => ids.includes(m.id) && m.sender === "seller" && !m.adminReadAt).length;
      queryClient.setQueryData(MESSAGES_KEY, (rows) => (rows ?? []).map((m) => (ids.includes(m.id) ? { ...m, adminReadAt: m.adminReadAt ?? at } : m)));
      queryClient.setQueryData(UNREAD_MESSAGES_KEY, (n) => Math.max(0, (n ?? 0) - hit));
      return { previousMessages, previousCount };
    },
    onError: (_error, _ids, context) => {
      queryClient.setQueryData(MESSAGES_KEY, context?.previousMessages);
      queryClient.setQueryData(UNREAD_MESSAGES_KEY, context?.previousCount);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: MESSAGES_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_MESSAGES_KEY });
    },
  });

  const unreadNotes = count.data ?? 0;
  const unreadMessages = messageCount.data ?? 0;
  const unread = unreadNotes + unreadMessages;
  const badge = badgeText(unread);
  const rows = list.data ?? [];
  const messageRows = bellMessages(messageList.data);
  const nothing = rows.length === 0 && messageRows.length === 0;
  const loading = list.isLoading || (open && messageList.isLoading && unreadMessages > 0);
  const busy = mark.isPending || markMessages.isPending;

  const markAll = () => {
    if (unreadNotes > 0) mark.mutate(undefined);
    const ids = (messageList.data ?? []).filter((m) => m.sender === "seller" && !m.adminReadAt).map((m) => m.id);
    if (ids.length > 0) markMessages.mutate(ids);
  };

  // Opening the screen a note is about also reads it, however the admin got there.
  const { pathname } = useLocation();
  useEffect(() => {
    const seen = (list.data ?? []).filter((row) => describeActivity(row).to === pathname).map((row) => row.id);
    if (seen.length > 0) mark.mutate(seen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, list.data]);

  const openMessage = (item) => {
    markMessages.mutate([item.id]);
    setOpen(false);
    navigate(item.to);
    buttonRef.current?.focus({ preventScroll: true });
  };

  const openRow = (row) => {
    const { to } = describeActivity(row);
    mark.mutate([row.id]);
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
            <button type="button" className="admin-bell__markall" disabled={unread === 0 || busy} onClick={markAll}>
              <FontAwesomeIcon icon={faCheckDouble} /> Mark all read
            </button>
          </div>

          {list.isError ? (
            <div className="admin-bell__empty" role="alert">
              <strong>{describeError(list.error).title}.</strong> {describeError(list.error).cause}
              <div><button type="button" className="admin-bell__markall" onClick={() => list.refetch()}>Try again</button></div>
            </div>
          ) : loading ? (
            <div className="admin-bell__empty">Loading…</div>
          ) : nothing ? (
            <div className="admin-bell__empty">You are all caught up. Notes you open are cleared from here. New messages and activity from sellers and applicants show up as they happen.</div>
          ) : (
            <>
              {messageRows.length > 0 ? (
                <section aria-labelledby="bell-messages-heading">
                  <h2 className="admin-bell__section heading-sm" id="bell-messages-heading">Messages <span className="admin-bell__count">{unreadMessages}</span></h2>
                  <ul className="admin-bell__list">
                    {messageRows.map((item) => (
                      <li key={item.id} className="admin-bell__row">
                        <button type="button" className="admin-bell__item is-unread" onClick={() => openMessage(item)} title="Open in Messages">
                          <span className="admin-bell__dot" aria-hidden="true" />
                          <span className="admin-bell__text">
                            <span className="admin-bell__who">{item.who}</span>
                            <span className="admin-bell__preview">{item.subject}: {item.preview}</span>
                            <span className="sr-only">(unread)</span>
                            <span className="admin-bell__time">{timeAgo(item.at)}</span>
                          </span>
                        </button>
                        <button type="button" className="admin-bell__read" disabled={busy} onClick={() => markMessages.mutate([item.id])} aria-label={`Mark message from ${item.who} as read`} title="Mark as read">
                          <FontAwesomeIcon icon={faCheck} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {rows.length > 0 ? (
                <section aria-labelledby="bell-activity-heading">
                  <h2 className="admin-bell__section heading-sm" id="bell-activity-heading">Activity <span className="admin-bell__count">{unreadNotes}</span></h2>
                  <ul className="admin-bell__list">
                    {rows.map((row) => {
                      const { text, to } = describeActivity(row);
                      return (
                        <li key={row.id} className="admin-bell__row">
                          <button type="button" className={`admin-bell__item ${row.read ? "" : "is-unread"}`} onClick={() => openRow(row)} title={to ? "Open" : undefined}>
                            <span className="admin-bell__dot" aria-hidden="true" />
                            <span className="admin-bell__text">
                              {text}
                              {row.read ? null : <span className="sr-only"> (unread)</span>}
                              <span className="admin-bell__time">{timeAgo(row.at)}</span>
                            </span>
                          </button>
                          {row.read ? null : (
                            <button type="button" className="admin-bell__read" disabled={busy} onClick={() => mark.mutate([row.id])} aria-label={`Mark as read: ${text}`} title="Mark as read">
                              <FontAwesomeIcon icon={faCheck} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
