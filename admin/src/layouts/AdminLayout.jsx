import { Link, NavLink, Outlet } from "react-router-dom";
import { useMemo, useState } from "react";

const navItems = [
  { label: "Command Center", to: "/admin", end: true, badge: "12" },
  { label: "Applications", to: "/admin/applications", badge: "7" },
  { label: "Businesses", to: "/admin/businesses", badge: "64" },
  { label: "Payments", to: "/admin/payments", badge: "3" },
  { label: "Settings", to: "/admin/settings" },
];

export default function AdminLayout() {
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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-item ${isActive ? "is-active" : ""}`}
            >
              <span className="admin-nav-item__label">{item.label}</span>
              {item.badge ? <span className="admin-nav-item__badge">{item.badge}</span> : null}
            </NavLink>
          ))}
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
              <div className="admin-breadcrumb">Overview / Command Center</div>
              <h1 className="admin-page-title">Command Center</h1>
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
            <div className="admin-avatar" aria-label="User profile">AO</div>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
