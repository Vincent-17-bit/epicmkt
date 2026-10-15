import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { markNotificationsRead } from "../api/index.js";
import { Button, Drawer, Skeleton } from "../components/index.js";
import Icon from "../components/Icon.jsx";
import { useToast } from "../components/Toast.jsx";
import { useNotifications } from "../hooks/useDashboard.js";
import { describeNotification } from "../lib/notify.js";
import { playChime } from "../lib/sound.js";
import { badgeFor, hrefOf } from "../routes/config.js";
import { useLiveStore } from "../state/liveStore.js";
import { ago, useNow } from "../pages/command/ActivityFeed.jsx";
import s from "../pages/command/command.module.css";

/** The bell's panel: what needs attention (the same counts as the sidebar), then the notification list with unread state. */
export default function NotificationsDrawer({ open, onClose, routes, counts }) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const notifications = useNotifications();
  const soundOn = useLiveStore((state) => state.soundOn);
  const now = useNow();
  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unread ?? 0;

  const mark = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (error) => toast.error(error.message),
  });

  const attention = routes.map((route) => ({ route, count: badgeFor(route, counts) })).filter((x) => x.count > 0);

  const toggleSound = () => {
    const next = !soundOn;
    useLiveStore.getState().setSound(next);
    if (next) playChime(); // the click is the gesture browsers need before they allow sound, and it lets people hear what they chose
  };

  const open_ = (item) => {
    if (!item.read_at) mark.mutate([item.id]);
    onClose();
    navigate(describeNotification(item).to);
  };

  return (
    <Drawer open={open} onClose={onClose} title="Notifications" description={unread ? `${unread} unread` : "You are up to date"}>
      <div className={s.drawerBody}>
        <div className={s.drawerTools}>
          <button type="button" role="switch" aria-checked={soundOn} className={s.switchRow} onClick={toggleSound}>
            <span className={s.track} aria-hidden="true" /> Sound for new items
          </button>
          <Button size="sm" variant="secondary" disabled={unread === 0} loading={mark.isPending} onClick={() => mark.mutate("all")}>Mark all read</Button>
        </div>

        <section aria-labelledby="drawer-attention">
          <h3 id="drawer-attention" className={s.sectionTitle}>Needs attention</h3>
          {attention.length === 0 ? <p className={s.panelNote}>Nothing is waiting for you.</p> : (
            <ul className={s.pills}>
              {attention.map(({ route, count }) => (
                <li key={route.id}><Link to={hrefOf(route)} onClick={onClose}>{route.title} <b>{count}</b></Link></li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="drawer-recent">
          <h3 id="drawer-recent" className={s.sectionTitle}>Recent</h3>
          {notifications.isPending ? (
            <div className={s.skeletonRows}><Skeleton variant="rect" height="3rem" /><Skeleton variant="rect" height="3rem" /></div>
          ) : notifications.isError ? (
            <p className={s.panelNote}>Notifications could not load. <Button size="sm" variant="ghost" onClick={() => notifications.refetch()}>Try again</Button></p>
          ) : items.length === 0 ? (
            <p className={s.panelNote}>No notifications yet.</p>
          ) : (
            <ul className={s.list}>
              {items.map((item) => {
                const note = describeNotification(item);
                return (
                  <li key={item.id}>
                    <button type="button" className={`${s.drawerFeedBtn} ${s.feedItem}`} onClick={() => open_(item)}>
                      <span className={s.feedIcon}><Icon name={note.icon} /></span>
                      <span>
                        <span className={s.feedTitle} style={{ display: "block" }}>{!item.read_at ? <><span className={s.unreadMark} aria-hidden="true" /><span className="sr-only">Unread. </span></> : null}{note.title}</span>
                        {note.detail ? <span className={s.feedDetail} style={{ display: "block" }}>{note.detail}</span> : null}
                      </span>
                      <time className={s.feedTime} dateTime={item.created_at}>{ago(item.created_at, now)}</time>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}
