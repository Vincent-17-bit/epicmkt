import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faBullhorn,
  faChartLine,
  faClockRotateLeft,
  faEllipsis,
  faComments,
  faCreditCard,
  faGaugeHigh,
  faGear,
  faGears,
  faHourglassHalf,
  faLayerGroup,
  faMoon,
  faShieldHalved,
  faSitemap,
  faStore,
  faSun,
  faRightFromBracket,
  faUserCheck,
  faUser,
  faFileSignature,
} from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useAdminCounts, useLiveRefresh } from "../hooks/useAdminCounts.js";
import { badgeText, navBadges } from "../lib/counts.js";
import { initialsOf } from "../lib/initials.js";
import SystemStatusCard from "../components/SystemStatusCard.jsx";
import GlobalSearch from "../components/GlobalSearch.jsx";
import { usePermissions } from "../hooks/usePermissions.js";
import useTableLabels from "../hooks/useTableLabels.js";
import NotificationBell from "../components/NotificationBell.jsx";

const navGroups = [
  [
    { label: "Command Center", to: "/admin", end: true, icon: faGaugeHigh, hint: "items need your attention" },
  ],
  [
    { label: "Applications", to: "/admin/applications", icon: faFileSignature, permission: "applications.view", hint: "applications waiting for a decision" },
    { label: "Businesses", to: "/admin/businesses", icon: faStore, permission: "businesses.view", hint: "sellers expiring within 7 days or in grace" },
    { label: "Expiry Radar", to: "/admin/expiry-radar", icon: faHourglassHalf, permission: "expiry.view" },
    { label: "Approvals", to: "/admin/approvals", icon: faUserCheck, permission: "approvals.view", hint: "seller change requests waiting" },
  ],
  [
    { label: "Moderation", to: "/admin/moderation", icon: faShieldHalved, permission: "moderation.view", hint: "open flags and reports" },
    { label: "Payments", to: "/admin/payments", icon: faCreditCard, permission: "payments.view", hint: "payments to confirm" },
  ],
  [
    { label: "Messages", to: "/admin/messages", icon: faComments, permission: "messages.view", hint: "unread messages from sellers" },
    { label: "Broadcasts", to: "/admin/broadcasts", icon: faBullhorn, permission: "messages.view" },
    { label: "Automation", to: "/admin/automation", icon: faGears, permission: "automation.view" },
  ],
  [
    { label: "Flash sales", to: "/admin/flash-sales", icon: faBolt, permission: "flash.view" },
    { label: "Plans", to: "/admin/plans", icon: faLayerGroup, permission: "plans.view" },
    { label: "Categories", to: "/admin/categories", icon: faSitemap, permission: "plans.view" },
  ],
  [
    { label: "Analytics", to: "/admin/analytics", icon: faChartLine, permission: "analytics.view" },
    { label: "Audit log", to: "/admin/audit", icon: faClockRotateLeft, permission: "audit.view" },
    { label: "Settings", to: "/admin/settings", icon: faGear, permission: "settings.view" },
  ],
];

const navItems = navGroups.flat();
const tabPaths = ["/admin", "/admin/applications", "/admin/businesses", "/admin/payments"];

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
  const [moreOpen, setMoreOpen] = useState(false);
  const contentRef = useRef(null);
  useTableLabels(contentRef);
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (event) => event.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("epicmkt-admin-theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useMemo(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("epicmkt-admin-theme", theme);
  }, [theme]);

  const visibleGroups = navGroups
    .map((group) => group.filter((item) => !item.permission || can(item.permission)))
    .filter((group) => group.length > 0);
  const visibleItems = visibleGroups.flat();
  const tabItems = visibleItems.filter((item) => tabPaths.includes(item.to));
  const moreItems = visibleItems.filter((item) => !tabPaths.includes(item.to));
  const moreActive = moreItems.some((item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)));
  const moreBadge = moreItems.reduce((sum, item) => sum + (badges[item.to] || 0), 0);
  const toggleTheme = () => setTheme((value) => (value === "light" ? "dark" : "light"));

  return (
    <div className="admin-app">
      <div className="admin-rail">
        <aside id="admin-sidebar" className="admin-sidebar">
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo">E</div>
            <div className="admin-sidebar__brand-copy"><strong>EpicMKT</strong><span>Admin</span></div>
          </div>

          <nav className="admin-sidebar__nav" aria-label="Admin navigation">
            {visibleGroups.map((group) => (
              <div key={group[0].to} className="admin-nav-group">
                {group.map((item) => {
                  const text = badgeText(badges[item.to]);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      title={item.label}
                      className={({ isActive }) => `admin-nav-item ${isActive ? "is-active" : ""}`}
                    >
                      <span className="admin-nav-item__icon"><FontAwesomeIcon icon={item.icon} fixedWidth /></span>
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
              </div>
            ))}
          </nav>

          <div className="admin-sidebar__footer">
            <SystemStatusCard />
          </div>
        </aside>
      </div>

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__left">
            <div className="admin-crumbs">
              <span className="admin-breadcrumb">Overview /</span>
              <h1 className="admin-page-title">{pageTitle}</h1>
            </div>
          </div>

          <div className="admin-header__right">
            <GlobalSearch />
            <NotificationBell />
            <button
              type="button"
              className="admin-theme-toggle admin-wide-only"
              aria-label="Toggle theme"
              onClick={toggleTheme}
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
              <button type="button" className="admin-theme-toggle admin-wide-only" onClick={signOut}>
                Sign out
              </button>
            )}
          </div>
        </header>

        <main className="admin-content" ref={contentRef}>
          <Outlet />
        </main>
      </div>

      {moreOpen ? <button type="button" className="admin-backdrop" aria-label="Close menu" onClick={() => setMoreOpen(false)} /> : null}

      {moreOpen ? (
        <div className="admin-more" role="dialog" aria-label="More">
          <div className="admin-more__grid">
            {moreItems.map((item) => {
              const text = badgeText(badges[item.to]);
              return (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `admin-more__item ${isActive ? "is-active" : ""}`}>
                  <FontAwesomeIcon icon={item.icon} fixedWidth />
                  <span>{item.label}</span>
                  {text ? <b className="admin-more__badge">{text}</b> : null}
                </NavLink>
              );
            })}
          </div>
          <div className="admin-more__foot">
            <button type="button" className="admin-more__item" onClick={toggleTheme}>
              <FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} fixedWidth />
              <span>{theme === "light" ? "Dark" : "Light"}</span>
            </button>
            <Link to="/admin/account" className="admin-more__item">
              <FontAwesomeIcon icon={faUser} fixedWidth />
              <span>Account</span>
            </Link>
            {demo ? null : (
              <button type="button" className="admin-more__item" onClick={signOut}>
                <FontAwesomeIcon icon={faRightFromBracket} fixedWidth />
                <span>Sign out</span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      <nav className="admin-tabbar" aria-label="Main">
        {tabItems.map((item) => {
          const text = badgeText(badges[item.to]);
          return (
            <NavLink key={item.to} to={item.to} end={item.end} title={item.label} className={({ isActive }) => `admin-tab ${isActive ? "is-active" : ""}`}>
              <FontAwesomeIcon icon={item.icon} fixedWidth />
              <span>{item.label === "Command Center" ? "Home" : item.label}</span>
              {text ? <b className="admin-tab__badge">{text}</b> : null}
            </NavLink>
          );
        })}
        {moreItems.length ? (
          <button type="button" className={`admin-tab ${moreActive || moreOpen ? "is-active" : ""}`} aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>
            <FontAwesomeIcon icon={faEllipsis} fixedWidth />
            <span>More</span>
            {moreBadge ? <b className="admin-tab__badge">{badgeText(moreBadge)}</b> : null}
          </button>
        ) : null}
      </nav>
    </div>
  );
}
