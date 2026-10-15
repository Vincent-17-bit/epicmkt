import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useAdminCounts } from "../hooks/useAdminCounts.js";
import { useLiveSync } from "../hooks/useLiveSync.js";
import { usePermissions } from "../hooks/usePermissions.js";
import { useTheme } from "../hooks/useTheme.js";
import { bottomBarRoutes, findRoute, visibleRoutes } from "../routes/config.js";
import BottomBar from "./BottomBar.jsx";
import Header from "./Header.jsx";
import IdleGuard from "./IdleGuard.jsx";
import MobileDrawer from "./MobileDrawer.jsx";
import Sidebar from "./Sidebar.jsx";

const SIDEBAR_KEY = "epicmkt-admin-sidebar";
const isTyping = (el) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function initialCollapsed() {
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved) return saved === "collapsed";
  } catch { /* ignore */ }
  return window.innerWidth < 1100; // tablets start collapsed to leave room for the page
}

export default function AdminLayout() {
  const { admin, signOut } = useAuth();
  const { role } = usePermissions();
  const { data: counts } = useAdminCounts();
  useLiveSync(); // Realtime: keeps counts, the dashboard and notifications fresh, and raises the soft toasts
  const { pathname } = useLocation();
  const route = findRoute(pathname);
  const routes = visibleRoutes(role);

  const [theme, toggleTheme] = useTheme();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const titleRef = useRef(null);
  const menuRef = useRef(null);
  const moreRef = useRef(null);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((value) => {
      try { localStorage.setItem(SIDEBAR_KEY, value ? "expanded" : "collapsed"); } catch { /* ignore */ }
      return !value;
    });
  }, []);

  // "[" collapses or expands the sidebar, unless the person is typing.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "[" || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      toggleSidebar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  // On each page change: close the drawer, put the title in the tab, and move focus to the page heading.
  useEffect(() => {
    document.title = `${route?.title ?? "Not found"} · EpicMKT Admin`;
    setDrawerOpen(false);
    titleRef.current?.focus({ preventScroll: true });
    document.getElementById("admin-content")?.scrollTo?.(0, 0);
  }, [route?.title, pathname]);

  return (
    <div className="app">
      <a className="skip-link" href="#admin-content">Skip to content</a>
      <Sidebar routes={routes} counts={counts} collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="app__main">
        <Header
          route={route} routes={routes} counts={counts} admin={admin} theme={theme} onToggleTheme={toggleTheme}
          onOpenMenu={() => setDrawerOpen(true)} menuRef={menuRef} titleRef={titleRef} onSignOut={() => signOut()}
        />
        <main className="content" id="admin-content" tabIndex={-1}>
          <Suspense fallback={<p className="page-loading" role="status">Loading…</p>}>
            <Outlet />
          </Suspense>
        </main>
        <BottomBar routes={bottomBarRoutes(role)} counts={counts} onMore={() => setDrawerOpen(true)} moreRef={moreRef} />
      </div>
      <MobileDrawer open={drawerOpen} onClose={closeDrawer} routes={routes} counts={counts} admin={admin} onSignOut={() => signOut()} />
      <IdleGuard />
    </div>
  );
}
