import Icon from "../components/Icon.jsx";
import { useNotifications } from "../hooks/useDashboard.js";
import { useLiveStore } from "../state/liveStore.js";
import { formatBadge } from "./NavList.jsx";
import NotificationsDrawer from "./NotificationsDrawer.jsx";

/** The bell. Its number is the unread notifications; the drawer it opens also lists everything that needs attention. */
export default function BellMenu({ routes, counts }) {
  const open = useLiveStore((state) => state.drawerOpen);
  const { openDrawer, closeDrawer } = useLiveStore.getState();
  const { data } = useNotifications();
  const unread = data?.unread ?? 0;

  return (
    <>
      <button type="button" className="icon-button" aria-haspopup="dialog" aria-expanded={open} onClick={openDrawer}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications, none unread"}>
        <Icon name="bell" />
        {unread > 0 ? <span className="nav-badge nav-badge--corner" aria-hidden="true">{formatBadge(unread)}</span> : null}
      </button>
      <NotificationsDrawer open={open} onClose={closeDrawer} routes={routes} counts={counts} />
    </>
  );
}
