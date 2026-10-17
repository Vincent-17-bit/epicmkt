import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAnglesLeft,
  faArrowLeft,
  faBars,
  faBell,
  faCircleCheck,
  faCreditCard,
  faGauge,
  faGear,
  faInbox,
  faMagnifyingGlass,
  faMoon,
  faStore,
  faSun,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import Button from "../components/Button.jsx";
import { BELOW_LG } from "../lib/breakpoints.js";
import { useOverlay } from "../lib/overlay.js";
import { useTheme } from "../lib/theme.js";
import { useMediaQuery } from "../lib/useMediaQuery.js";

const NAV = [
  { label: "Command Center", to: "/admin", end: true, icon: faGauge, badge: "12" },
  { label: "Applications", to: "/admin/applications", icon: faInbox, badge: "7" },
  { label: "Businesses", to: "/admin/businesses", icon: faStore, badge: "64" },
  { label: "Payments", to: "/admin/payments", icon: faCreditCard, badge: "3" },
  { label: "Settings", to: "/admin/settings", icon: faGear },
];

const SWIPE_CLOSE = 64;

function pageTitle(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const match = NAV.find((item) => (item.end ? path === item.to : path.startsWith(item.to)));
  return match?.label ?? "Admin";
}

export default function AdminLayout() {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const drawer = useMediaQuery(BELOW_LG);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const sidebarRef = useRef(null);
  const columnRef = useRef(null);
  const contentRef = useRef(null);
  const searchRef = useRef(null);
  const swipe = useRef(null);

  const title = pageTitle(pathname);
  const drawerOpen = drawer && open;
  const rail = !drawer && collapsed;
  const nextTheme = theme === "light" ? "dark" : "light";

  const closeDrawer = () => setOpen(false);

  useEffect(() => {
    document.title = `${title} · EpicMKT Admin`;
    contentRef.current?.scrollTo(0, 0);
    setOpen(false);
  }, [title, pathname]);

  useEffect(() => {
    if (!drawer) setOpen(false);
    else setSearching(false);
  }, [drawer]);

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  // The page behind an open drawer must not take focus. Declared before
  // useOverlay so its cleanup runs first and focus can return to the opener.
  useEffect(() => {
    const column = columnRef.current;
    if (!drawerOpen || !column) return undefined;
    column.inert = true;
    return () => {
      column.inert = false;
    };
  }, [drawerOpen]);

  useOverlay(sidebarRef, {
    active: drawerOpen,
    onClose: closeDrawer,
    initialFocus: (node) => node.querySelector(".admin-nav-item.is-active") ?? node.querySelector("a"),
  });

  const onTouchStart = (event) => {
    const touch = event.touches[0];
    swipe.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchMove = (event) => {
    if (!swipe.current) return;
    const touch = event.touches[0];
    const dx = touch.clientX - swipe.current.x;
    const dy = touch.clientY - swipe.current.y;
    if (dx < -SWIPE_CLOSE && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipe.current = null;
      closeDrawer();
    }
  };

  const searchRow = drawer && searching;

  return (
    <div className="admin-app">
      <a className="admin-skip" href="#main-content">Skip to content</a>

      {drawerOpen ? <div className="admin-scrim" onClick={closeDrawer} aria-hidden="true" /> : null}

      <aside
        id="admin-sidebar"
        ref={sidebarRef}
        tabIndex={-1}
        aria-label="Sidebar"
        className={["admin-sidebar", rail && "is-collapsed", drawerOpen && "is-open"].filter(Boolean).join(" ")}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => {
          swipe.current = null;
        }}
      >
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__logo" aria-hidden="true">E</div>
          <div className="admin-sidebar__brand-copy"><strong>EpicMKT</strong><span>Admin</span></div>
          <button type="button" className="admin-nav-item admin-sidebar__drawer-only admin-sidebar__close" aria-label="Close menu" onClick={closeDrawer}>
            <FontAwesomeIcon icon={faXmark} className="admin-icon" />
          </button>
        </div>

        <nav className="admin-sidebar__nav" aria-label="Admin navigation">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={rail ? item.label : undefined}
              className={({ isActive }) => `admin-nav-item ${isActive ? "is-active" : ""}`}
              onClick={closeDrawer}
            >
              <span className="admin-nav-item__icon"><FontAwesomeIcon icon={item.icon} className="admin-icon" /></span>
              <span className="admin-nav-item__label">{item.label}</span>
              {item.badge ? <span className="admin-nav-item__badge">{item.badge}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__foot">
          <button type="button" className="admin-nav-item admin-sidebar__drawer-only" onClick={toggle}>
            <span className="admin-nav-item__icon"><FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} className="admin-icon" /></span>
            <span className="admin-nav-item__label">{theme === "light" ? "Dark theme" : "Light theme"}</span>
          </button>
          <button
            type="button"
            className="admin-nav-item admin-sidebar__rail-only"
            aria-expanded={!collapsed}
            title={rail ? "Expand sidebar" : undefined}
            onClick={() => setCollapsed((value) => !value)}
          >
            <span className="admin-nav-item__icon"><FontAwesomeIcon icon={faAnglesLeft} className="admin-icon admin-nav-item__chevron" /></span>
            <span className="admin-nav-item__label">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
          </button>
          <div className="admin-system-card">
            <div className="admin-system-card__full">
              <div className="admin-system-card__title">System Status</div>
              <span className="status-pill status-pill--healthy">Healthy</span>
              <span>Last sync: 4 mins ago</span>
            </div>
            <span className="admin-system-card__compact" role="img" aria-label="System healthy, last sync 4 minutes ago">
              <FontAwesomeIcon icon={faCircleCheck} className="admin-icon" />
            </span>
          </div>
        </div>
      </aside>

      <div className="admin-main" ref={columnRef}>
        <header className="admin-header">
          {searchRow ? (
            <div className="admin-search-row">
              <Button icon={faArrowLeft} className="admin-button--header" aria-label="Close search" onClick={() => setSearching(false)} />
              <label className="admin-global-search admin-global-search--full">
                <FontAwesomeIcon icon={faMagnifyingGlass} className="admin-icon" />
                <input
                  ref={searchRef}
                  type="search"
                  placeholder="Search everything"
                  aria-label="Search admin"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setSearching(false);
                  }}
                />
              </label>
            </div>
          ) : (
            <>
              <div className="admin-header__left">
                {drawer ? (
                  <Button
                    icon={faBars}
                    className="admin-button--header"
                    aria-label="Open menu"
                    aria-expanded={drawerOpen}
                    aria-controls="admin-sidebar"
                    onClick={() => setOpen(true)}
                  />
                ) : null}
                <div className="admin-header__titles">
                  <div className="admin-breadcrumb">Overview / {title}</div>
                  <h1 className="admin-page-title">{title}</h1>
                </div>
              </div>

              <div className="admin-header__right">
                {drawer ? (
                  <Button icon={faMagnifyingGlass} className="admin-button--header" aria-label="Search" onClick={() => setSearching(true)} />
                ) : (
                  <label className="admin-global-search">
                    <FontAwesomeIcon icon={faMagnifyingGlass} className="admin-icon" />
                    <input type="search" placeholder="Search everything" aria-label="Search admin" />
                  </label>
                )}
                <Button icon={faBell} className="admin-button--header" aria-label="Notifications" />
                <Button
                  icon={theme === "light" ? faMoon : faSun}
                  className="admin-button--header admin-header__secondary"
                  aria-label={`Switch to ${nextTheme} theme`}
                  onClick={toggle}
                />
                <span className="admin-avatar admin-header__secondary" role="img" aria-label="Signed in as AO">AO</span>
              </div>
            </>
          )}
        </header>

        <main id="main-content" ref={contentRef} tabIndex={-1} className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
