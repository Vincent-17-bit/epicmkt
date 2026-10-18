import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useAdminCounts, useLiveRefresh } from "../hooks/useAdminCounts.js";
import { badgeText, navBadges } from "../lib/counts.js";
import { initialsOf } from "../lib/initials.js";

// `hint` is what the badge number means, for the tooltip and screen readers.
const navItems = [
  { label: "Command Center", to: "/admin", end: true, hint: "items need your attention" },
  { label: "Applications", to: "/admin/applications", hint: "applications waiting for a decision" },
  { label: "Businesses", to: "/admin/businesses", hint: "sellers expiring within 7 days or in grace" },
  { label: "Payments", to: "/admin/payments", hint: "payments to confirm" },
  { label: "Flash sales", to: "/admin/flash-sales" },
  { label: "Settings", to: "/admin/settings" },
];

// The page the current URL belongs to ("/admin/applications/123" is Applications).
function currentPage(pathname) {
  const match = navItems
    .filter((item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match?.label ?? "Admin";
}

export default function AdminLayout() {
  const { admin, demo, signOut } = useAuth();
  const { pathname } = useLocation();
  const pageTitle = currentPage(pathname);
  const counts = useAdminCounts();
  const badges = navBadges(counts.data);
  useLiveRefresh();
  const displayName = admin?.displayName || admin?.email || "Admin";
  const [collapsed, setCollapsed] = useState(false);
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
      <aside className={`admin-sidebar ${collapsed ? "is-collapsed" : ""}`}>
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__logo">E</div>
          {!collapsed && <div className="admin-sidebar__brand-copy"><strong>EpicMKT</strong><span>Admin</span></div>}
          <button
            type="button"
            className="admin-sidebar__toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        <nav className="admin-sidebar__nav" aria-label="Admin navigation">
          {navItems.map((item) => {
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
          <div className="admin-system-card">
            <div className="admin-system-card__title">System Status</div>
            <div className="admin-system-card__content">
              <span className="status-pill status-pill--healthy">Healthy</span>
              <span>Last sync: 4 mins ago</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__left">
            <button type="button" className="admin-icon-button admin-mobile-only" aria-label="Open menu">
              ☰
            </button>
            <div>
              <div className="admin-breadcrumb">Overview / {pageTitle}</div>
              <h1 className="admin-page-title">{pageTitle}</h1>
            </div>
          </div>

          <div className="admin-header__right">
            <label className="admin-global-search" aria-label="Search admin">
              <span>⌕</span>
              <input type="search" placeholder="Search everything" readOnly />
            </label>
            <button type="button" className="admin-icon-button" aria-label="Notifications">
              🔔
            </button>
            <button
              type="button"
              className="admin-theme-toggle"
              aria-label="Toggle theme"
              onClick={() => setTheme((value) => (value === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? "Dark" : "Light"}
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
