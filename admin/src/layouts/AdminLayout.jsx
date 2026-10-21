import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faChevronLeft, faChevronRight, faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useAdminCounts, useLiveRefresh } from "../hooks/useAdminCounts.js";
import { badgeText, navBadges } from "../lib/counts.js";
import { initialsOf } from "../lib/initials.js";
import SystemStatusCard from "../components/SystemStatusCard.jsx";
import GlobalSearch from "../components/GlobalSearch.jsx";
import { usePermissions } from "../hooks/usePermissions.js";
import NotificationBell from "../components/NotificationBell.jsx";

// `hint` is what the badge number means, for the tooltip and screen readers.
const navItems = [
  { label: "Command Center", to: "/admin", end: true, hint: "items need your attention" },
  { label: "Applications", to: "/admin/applications", permission: "applications.view", hint: "applications waiting for a decision" },
  { label: "Businesses", to: "/admin/businesses", permission: "businesses.view", hint: "sellers expiring within 7 days or in grace" },
  { label: "Expiry Radar", to: "/admin/expiry-radar", permission: "expiry.view" },
  { label: "Approvals", to: "/admin/approvals", permission: "approvals.view", hint: "seller change requests waiting" },
  { label: "Moderation", to: "/admin/moderation", permission: "moderation.view", hint: "open flags and reports" },
  { label: "Payments", to: "/admin/payments", permission: "payments.view", hint: "payments to confirm" },
  { label: "Messages", to: "/admin/messages", permission: "messages.view", hint: "unread messages from sellers" },
  { label: "Broadcasts", to: "/admin/broadcasts", permission: "messages.view" },
  { label: "Automation", to: "/admin/automation", permission: "automation.view" },
  { label: "Flash sales", to: "/admin/flash-sales", permission: "flash.view" },
  { label: "Plans", to: "/admin/plans", permission: "plans.view" },
  { label: "Categories", to: "/admin/categories", permission: "plans.view" },
  { label: "Analytics", to: "/admin/analytics", permission: "analytics.view" },
  { label: "Audit log", to: "/admin/audit", permission: "audit.view" },
  { label: "Settings", to: "/admin/settings", permission: "settings.view" },
];

// The page the current URL belongs to ("/admin/applications/123" is Applications).
function currentPage(pathname) {
  const match = navItems
    .filter((item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match?.label ?? "Admin";
}

export default function AdminLayout() {
  const { can } = usePermissions();
  const { admin, demo, signOut } = useAuth();
  const { pathname } = useLocation();
  const pageTitle = currentPage(pathname);
  const counts = useAdminCounts();
  const unreadMessages = useQuery({ queryKey: ["admin-unread-messages"], queryFn: () => api.getUnreadMessages(), refetchInterval: 60_000, retry: false });
  const badges = { ...navBadges(counts.data), "/admin/messages": unreadMessages.data || 0 };
  useLiveRefresh();
  const displayName = admin?.displayName || admin?.email || "Admin";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [pathname]); // choosing a page closes the phone menu
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("epicmkt-admin-theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useMemo(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("epicmkt-admin-theme", theme);
  }, [theme]);

  return (
    <div className="admin-app">
      <aside id="admin-sidebar" className={`admin-sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__logo">E</div>
          {!collapsed && <div className="admin-sidebar__brand-copy"><strong>EpicMKT</strong><span>Admin</span></div>}
          <button
            type="button"
            className="admin-sidebar__toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} />
          </button>
        </div>

        <nav className="admin-sidebar__nav" aria-label="Admin navigation">
          {navItems.filter((item) => !item.permission || can(item.permission)).map((item) => {
            const text = badgeText(badges[item.to]);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `admin-nav-item ${isActive ? "is-active" : ""}`}
              >
                <span className="admin-nav-item__label">{item.label}</span>
                {text ? (
                  <span className="admin-nav-item__badge" title={`${badges[item.to]} ${item.hint}`}>
                    {text}
                    <span className="sr-only"> {item.hint}</span>
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="admin-sidebar__footer">
          <SystemStatusCard collapsed={collapsed} onExpand={() => setCollapsed(false)} />
        </div>
      </aside>

      {mobileOpen ? <button type="button" className="admin-backdrop" aria-label="Close menu" onClick={() => setMobileOpen(false)} /> : null}

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__left">
            <button
              type="button"
              className="admin-icon-button admin-mobile-only"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="admin-sidebar"
              onClick={() => setMobileOpen((value) => !value)}
            >
              <FontAwesomeIcon icon={faBars} />
            </button>
            <div>
              <div className="admin-breadcrumb">Overview / {pageTitle}</div>
              <h1 className="admin-page-title">{pageTitle}</h1>
            </div>
          </div>

          <div className="admin-header__right">
            <GlobalSearch />
            <NotificationBell />
            <button
              type="button"
              className="admin-theme-toggle"
              aria-label="Toggle theme"
              onClick={() => setTheme((value) => (value === "light" ? "dark" : "light"))}
            >
              <FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} /> {theme === "light" ? "Dark" : "Light"}
            </button>
            <Link
              to="/admin/account"
              className="admin-avatar"
              aria-label={`Account of ${displayName}`}
              title={admin?.role ? `${displayName} (${admin.role}): account and password` : displayName}
            >
              {initialsOf(displayName)}
            </Link>
            {demo ? null : (
              <button type="button" className="admin-theme-toggle" onClick={signOut}>
                Sign out
              </button>
            )}
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
