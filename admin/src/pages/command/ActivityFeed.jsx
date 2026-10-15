import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Skeleton } from "../../components/index.js";
import Icon from "../../components/Icon.jsx";
import { describeNotification } from "../../lib/notify.js";
import { durationText } from "../../lib/series.js";
import { useLiveStore } from "../../state/liveStore.js";
import s from "./command.module.css";

const CONNECTION = { live: "Live", connecting: "Connecting…", offline: "Offline, refreshing every 2 min" };

export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export const ago = (iso, now) => {
  const ms = now.getTime() - Date.parse(iso);
  return ms < 60_000 ? "just now" : `${durationText(ms)} ago`;
};

/** The newest notifications as a ticker. New arrivals flash once; the connection state is always spelled out in words. */
export default function ActivityFeed({ notifications, loading, limit = 8 }) {
  const connection = useLiveStore((state) => state.connection);
  const now = useNow();
  const known = useRef(null);
  const items = (notifications?.items ?? []).slice(0, limit);

  // The first render never flashes; only ids that show up later do.
  const fresh = new Set();
  if (known.current && notifications) for (const item of items) if (!known.current.has(item.id)) fresh.add(item.id);
  useEffect(() => { if (notifications) known.current = new Set((notifications.items ?? []).map((item) => item.id)); }, [notifications]);

  return (
    <Card as="section" title="Live activity" headingLevel={2} className={s.span5} aria-busy={loading || undefined}
      actions={<span className={s.liveChip} data-state={connection} role="status"><span className={s.liveDot} aria-hidden="true" />{CONNECTION[connection]}</span>}>
      {loading ? (
        <div className={s.skeletonRows}><Skeleton variant="rect" height="2.5rem" /><Skeleton variant="rect" height="2.5rem" /><Skeleton variant="rect" height="2.5rem" /></div>
      ) : items.length === 0 ? (
        <p className={s.panelNote}>Nothing yet. New applications, payments and replies appear here as they happen.</p>
      ) : (
        <ul className={s.list}>
          {items.map((item) => {
            const note = describeNotification(item);
            return (
              <li key={item.id}>
                <Link className={s.feedItem} to={note.to} data-new={fresh.has(item.id) || undefined}>
                  <span className={s.feedIcon}><Icon name={note.icon} /></span>
                  <div>
                    <p className={s.feedTitle}>{!item.read_at ? <><span className={s.unreadMark} aria-hidden="true" /><span className="sr-only">Unread. </span></> : null}{note.title}</p>
                    {note.detail ? <p className={s.feedDetail}>{note.detail}</p> : null}
                  </div>
                  <time className={s.feedTime} dateTime={item.created_at}>{ago(item.created_at, now)}</time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
