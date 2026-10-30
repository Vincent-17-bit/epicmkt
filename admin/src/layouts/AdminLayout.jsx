import { LogoMark } from "@epicmkt/ui";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAnglesLeft, faAnglesRight, faEllipsis, faRightFromBracket, faUser } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useAdminCounts, useLiveRefresh } from "../hooks/useAdminCounts.js";
import { badgeText, navBadges } from "../lib/counts.js";
import { initialsOf } from "../lib/initials.js";
import { buildCrumbs, isItemActive } from "../lib/breadcrumbs.js";
import SystemStatusCard from "../components/SystemStatusCard.jsx";
import GlobalSearch from "../components/GlobalSearch.jsx";
import { usePermissions } from "../hooks/usePermissions.js";
import useSidebar from "../hooks/useSidebar.js";
import useTableLabels from "../hooks/useTableLabels.js";
import NotificationBell from "../components/NotificationBell.jsx";
import ThemeToggle from "../theme/ThemeToggle.jsx";
import { navGroups, tabPaths } from "./navConfig.js";

export default function AdminLayout() {
  const { can } = usePermissions();
  const { admin, demo, signOut } = useAuth();
  const { pathname } = useLocation();
  const { title: pageTitle, crumbs } = buildCrumbs(pathname, navGroups);
  const counts = useAdminCounts();
  const unreadMessages = useQuery({ queryKey: ["admin-unread-messages"], queryFn: () => api.getUnreadMessages(), refetchInterval: 60_000, retry: false });
  const badges = { ...navBadges(counts.data), "/admin/messages": unreadMessages.data || 0 };
  useLiveRefresh();
  const displayName = admin?.displayName || admin?.email || "Admin";
  const [moreOpen, setMoreOpen] = useState(false);
  const { collapsed, toggle: toggleSidebar } = useSidebar();
  const [tip, setTip] = useState(null);
  const contentRef = useRef(null);
  useTableLabels(contentRef);
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => setTip(null), [pathname, collapsed]);
  useEffect(() => {
    document.title = `${pageTitle} · EpicMKT Admin`;
  }, [pageTitle]);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (event) => event.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);
  useEffect(() => {
    if (!tip) return undefined;
    const onKey = (event) => event.key === "Escape" && setTip(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tip]);

  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || can(item.permission)) }))
    .filter((group) => group.items.length > 0);
  const visibleItems = visibleGroups.flatMap((group) => group.items);
  const tabItems = visibleItems.filter((item) => tabPaths.includes(item.to));
  const moreItems = visibleItems.filter((item) => !tabPaths.includes(item.to));
  const moreActive = moreItems.some((item) => isItemActive(item, pathname));
  const moreBadge = moreItems.reduce((sum, item) => sum + (badges[item.to] || 0), 0);

  // The collapsed rail shows a name tooltip on mouse hover and on keyboard focus only. A tap just navigates, so
  // nothing here depends on hover. Labels stay in the page for screen readers either way.
  const showTip = (event, label) => {
    if (!collapsed) return;
    const box = event.currentTarget.getBoundingClientRect();
    setTip({ label, top: box.top + box.height / 2, left: box.right });
  };
  const showTipOnMouse = (event, label) => {
    if (event.pointerType === "mouse") showTip(event, label);
  };
  const showTipOnKeyboardFocus = (event, label) => {
    let keyboard = false;
    try {
      keyboard = event.currentTarget.matches(":focus-visible");
    } catch {
      keyboard = false;
    }
    if (keyboard) showTip(event, label);
  };
  const hideTip = () => setTip(null);
  const tipHandlers = (label) => ({
    onPointerEnter: (event) => showTipOnMouse(event, label),
    onPointerLeave: hideTip,
    onFocus: (event) => showTipOnKeyboardFocus(event, label),
    onBlur: hideTip,
  });

  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <div className={`admin-app ${collapsed ? "admin-app--collapsed" : ""}`}>
      <a className="skip-link" href="#admin-content">Skip to content</a>

      <div className="admin-rail">
        <aside id="admin-sidebar" className="admin-sidebar">
          <div className="admin-sidebar__brand">
            <LogoMark size={32} />
            <div className="admin-sidebar__brand-copy"><strong>EpicMKT</strong><span>Admin</span></div>
          </div>

          <nav className="admin-sidebar__nav" aria-label="Admin navigation">
            {visibleGroups.map((group) => (
              <div key={group.items[0].to} className="admin-nav-group" role="group" aria-label={group.label}>
                {group.label ? <p className="admin-nav-group__label" aria-hidden="true">{group.label}</p> : null}
                {group.items.map((item) => {
                  const text = badgeText(badges[item.to]);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => `admin-nav-item ${isActive ? "is-active" : ""}`}
                      {...tipHandlers(item.label)}
                    >
                      <span className="admin-nav-item__icon"><FontAwesomeIcon icon={item.icon} fixedWidth /></span>
                      <span className="admin-nav-item__label">{item.label}</span>
                      {text ? (
                        <span className="admin-nav-item__badge">
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
            <button
              type="button"
              className="admin-sidebar-toggle"
              aria-expanded={!collapsed}
              aria-controls="admin-sidebar"
              onClick={toggleSidebar}
              {...tipHandlers(toggleLabel)}
            >
              <span className="admin-nav-item__icon"><FontAwesomeIcon icon={collapsed ? faAnglesRight : faAnglesLeft} fixedWidth /></span>
              <span className="admin-sidebar-toggle__label">{toggleLabel}</span>
            </button>
            <SystemStatusCard />
          </div>
        </aside>
      </div>

      {tip ? <div className="admin-tooltip" role="presentation" style={{ "--tip-top": `${tip.top}px`, "--tip-left": `${tip.left}px` }}>{tip.label}</div> : null}

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__left">
            <div className="admin-crumbs">
              {crumbs.length > 1 ? (
                <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
                  <ol>
                    {crumbs.map((crumb, index) => {
                      const last = index === crumbs.length - 1;
                      return (
                        <li key={`${crumb.label}-${index}`}>
                          {crumb.to && !last ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current={last ? "page" : undefined}>{crumb.label}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </nav>
              ) : null}
              <h1 className="admin-page-title">{pageTitle}</h1>
            </div>
          </div>

          <div className="admin-header__right">
            <GlobalSearch />
            <NotificationBell />
            <ThemeToggle />
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

        <main className="admin-content" id="admin-content" tabIndex={-1} ref={contentRef}>
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
            <ThemeToggle variant="menu" />
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
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `admin-tab ${isActive ? "is-active" : ""}`}>
              <FontAwesomeIcon icon={item.icon} fixedWidth />
              <span>{item.to === "/admin" ? "Home" : item.label}</span>
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
