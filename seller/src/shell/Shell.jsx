import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../state/session.js";
import { DEFAULT_IDLE, idleMinutes, useIdle } from "../state/useIdle.js";
import { readStore, writeStore } from "../lib/storage.js";
import { banner as bannerFor, canOpen, daysLeft, highlightSubscription, listingState } from "../lib/listing.js";
import * as api from "../api/index.js";
import Header from "./Header.jsx";
import Sidebar from "./Sidebar.jsx";
import BottomNav from "./BottomNav.jsx";
import MoreSheet from "./MoreSheet.jsx";
import Drawer from "./Drawer.jsx";
import Banner from "./Banner.jsx";
import ScrollArea from "./ScrollArea.jsx";
import LockedState from "./LockedState.jsx";
import IdleDialog from "./IdleDialog.jsx";
import styles from "./shell.module.css";

const SIDEBAR_KEY = "epicmkt-seller-sidebar";
const DevSimulator = import.meta.env?.DEV ? lazy(() => import("../dev/DevSimulator.jsx")) : null;
const MORE_PATHS = ["/subscription", "/notifications", "/help", "/settings"];

export default function Shell() {
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const signOut = useSession((s) => s.signOut);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => readStore(SIDEBAR_KEY) === "collapsed");
  const [drawer, setDrawer] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const business = me.business;
  const state = listingState(business);
  const left = daysLeft(business.paid_until);
  const unread = me.notifications.filter((n) => !n.read).length;
  const attention = highlightSubscription(state) ? "subscription" : null;
  const minutes = idleMinutes(me.settings?.idle_minutes ?? DEFAULT_IDLE);

  const doSignOut = useCallback(
    (notice) => {
      setMore(false);
      setDrawer(false);
      signOut(typeof notice === "string" ? notice : null).then(() => navigate("/login", { replace: true }));
    },
    [signOut, navigate]
  );

  const idle = useIdle({ minutes, active: true, onTimeout: () => doSignOut(`You were signed out after ${minutes} minutes of inactivity.`) });

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      writeStore(SIDEBAR_KEY, c ? "expanded" : "collapsed");
      return !c;
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const resume = async () => {
    setBusy(true);
    try {
      await api.pauseListing(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const banner = useMemo(() => bannerFor(state, left), [state, left]);
  const open = canOpen(state, pathname);

  return (
    <div className={styles.shell} data-collapsed={collapsed ? "true" : "false"} data-state={state}>
      <a href="#content" className={styles.skip}>Skip to content</a>
      <Sidebar collapsed={collapsed} onToggle={toggle} unread={unread} attention={attention} />
      <div className={styles.main}>
        <Header business={business} state={state} unread={unread} onMenu={() => setDrawer(true)} onSignOut={() => doSignOut()} />
        <ScrollArea>
          <Banner banner={banner} onResume={resume} busy={busy} />
          <div className={styles.page}>{open ? <Outlet /> : <LockedState state={state} reason={business.status_reason} />}</div>
        </ScrollArea>
        <BottomNav onMore={() => setMore(true)} moreActive={MORE_PATHS.includes(pathname)} attention={attention} />
      </div>
      <Drawer open={drawer} onClose={() => setDrawer(false)} unread={unread} attention={attention} />
      <MoreSheet open={more} onClose={() => setMore(false)} unread={unread} onSignOut={() => doSignOut()} />
      <IdleDialog open={idle.warning} seconds={idle.remaining} onStay={idle.stay} onSignOut={() => doSignOut()} />
      {DevSimulator && (
        <Suspense fallback={null}>
          <DevSimulator />
        </Suspense>
      )}
    </div>
  );
}
