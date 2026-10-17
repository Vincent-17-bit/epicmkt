import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBars,
  faBell,
  faChevronLeft,
  faChevronRight,
  faGaugeHigh,
  faGear,
  faInbox,
  faMagnifyingGlass,
  faMoon,
  faReceipt,
  faShop,
  faSun,
  faTable,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useMediaQuery } from "../lib/useMediaQuery.js";

/**
 * Single source of truth for navigation, page titles and breadcrumbs.
 * `section` is the breadcrumb parent; the title is the current page.
 */
const ROUTES = [
  { to: "/admin", end: true, title: "Command Center", section: "Overview", icon: faGaugeHigh, badge: "12", nav: true },
  { to: "/admin/applications", title: "Applications", section: "Operations", icon: faInbox, badge: "7", nav: true },
  { to: "/admin/businesses", title: "Businesses", section: "Operations", icon: faShop, badge: "64", nav: true },
  { to: "/admin/payments", title: "Payments", section: "Operations", icon: faReceipt, badge: "3", nav: true },
  { to: "/admin/settings", title: "Settings", section: "System", icon: faGear, nav: true },
  { to: "/admin/table-test", title: "Table test", section: "System", icon: faTable },
];

const FALLBACK = { title: "Admin", section: "Overview" };

function resolveRoute(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const exact = ROUTES.find((route) => route.to === clean);
  if (exact) return exact;
  // Longest-prefix match so nested routes (e.g. /admin/businesses/123) keep their parent title.
  const prefixed = ROUTES.filter((route) => !route.end && clean.startsWith(`${route.to}/`)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];
  return prefixed ?? FALLBACK;
}

const THEME_KEY = "epicmkt-admin-theme";

function readInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function AdminLayout() {
  const location = useLocation();
  const route = useMemo(() => resolveRoute(location.pathname), [location.pathname]);

  const isMobile = useMediaQuery("(max-width: 767.98px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023.98px)");

  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1024);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState(readInitialTheme);

  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchButtonRef = useRef(null);
  const drawerButtonRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  useEffect(() => {
    document.title = `${route.title} · EpicMKT Admin`;
  }, [route.title]);

  // Rail the sidebar on tablet widths, expand again on desktop.
  useEffect(() => {
    setCollapsed(isTablet);
  }, [isTablet]);

  // Any navigation or breakpoint change closes transient UI.
  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobile) {
      setDrawerOpen(false);
      setSearchOpen(false);
    }
  }, [isMobile]);

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) menuButtonRef.current?.focus();
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    searchButtonRef.current?.focus();
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    drawerButtonRef.current?.focus();
  }, []);

  // Avatar menu: outside click + Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || menuButtonRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeMenu(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, closeMenu]);

  // Drawer: Escape closes.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  // Mobile search overlay: focus the field on open.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const toggleTheme = () => setTheme((value) => (value === "light" ? "dark" : "light"));
  const nextThemeLabel = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  const railed = !isMobile && collapsed;

  const breadcrumb = route.title === route.section ? route.title : `${route.section} / ${route.title}`;

  return (
    <div className="admin-app">
      <a className="admin-skip-link" href="#admin-main-content">Skip to content</a>

      <aside
        id="admin-sidebar"
        className={`admin-sidebar ${railed ? "is-collapsed" : ""} ${drawerOpen ? "is-open" : ""}`}
        aria-label="Sidebar"
      >
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__logo" aria-hidden="true">E</div>
          {!railed && <div className="admin-sidebar__brand-copy"><strong>EpicMKT</strong><span>Admin</span></div>}
          {isMobile ? (
            <button type="button" className="admin-sidebar__toggle" aria-label="Close menu" onClick={closeDrawer}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          ) : (
            <button
              type="button"
              className="admin-sidebar__toggle"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((value) => !value)}
            >
              <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} />
            </button>
          )}
        </div>

        <nav className="admin-sidebar__nav" aria-label="Admin navigation">
          {ROUTES.filter((item) => item.nav).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={railed ? item.title : undefined}
              aria-label={railed && item.badge ? `${item.title}, ${item.badge} pending` : undefined}
              className={({ isActive }) => `admin-nav-item ${isActive ? "is-active" : ""}`}
            >
              <FontAwesomeIcon icon={item.icon} className="admin-nav-item__icon" fixedWidth />
              <span className="admin-nav-item__label">{item.title}</span>
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

      {drawerOpen ? <div className="admin-scrim" onClick={closeDrawer} aria-hidden="true" /> : null}

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__left">
            <button
              ref={drawerButtonRef}
              type="button"
              className="admin-icon-button admin-mobile-only"
              aria-label="Open menu"
              aria-controls="admin-sidebar"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <FontAwesomeIcon icon={faBars} />
            </button>
            <div className="admin-header__titles">
              <nav className="admin-breadcrumb" aria-label="Breadcrumb">{breadcrumb}</nav>
              <h1 className="admin-page-title" title={route.title}>{route.title}</h1>
            </div>
          </div>

          <div className="admin-header__right">
            <label className="admin-global-search" aria-label="Search admin">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="admin-global-search__icon" />
              <input
                type="search"
                placeholder="Search everything"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <button
              ref={searchButtonRef}
              type="button"
              className="admin-icon-button admin-search-trigger"
              aria-label="Search"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(true)}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </button>

            <button type="button" className="admin-icon-button" aria-label="Notifications">
              <FontAwesomeIcon icon={faBell} />
            </button>

            <button
              type="button"
              className="admin-icon-button admin-theme-toggle"
              aria-label={nextThemeLabel}
              title={nextThemeLabel}
              onClick={toggleTheme}
            >
              <FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} />
            </button>

            <div className="admin-menu">
              <button
                ref={menuButtonRef}
                type="button"
                className="admin-avatar-button"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="admin-avatar" aria-hidden="true">AO</span>
              </button>
              {menuOpen ? (
                <div ref={menuRef} className="admin-menu__panel" role="menu" aria-label="Account">
                  <button
                    type="button"
                    role="menuitem"
                    className="admin-menu__item admin-menu__item--mobile-only"
                    onClick={() => {
                      toggleTheme();
                      closeMenu(true);
                    }}
                  >
                    <FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} fixedWidth />
                    {nextThemeLabel}
                  </button>
                  <NavLink to="/admin/settings" role="menuitem" className="admin-menu__item" onClick={() => closeMenu()}>
                    <FontAwesomeIcon icon={faGear} fixedWidth />
                    Settings
                  </NavLink>
                </div>
              ) : null}
            </div>
          </div>

          {searchOpen ? (
            <div className="admin-search-overlay" role="search">
              <button type="button" className="admin-icon-button" aria-label="Close search" onClick={closeSearch}>
                <FontAwesomeIcon icon={faArrowLeft} />
              </button>
              <label className="admin-global-search admin-global-search--overlay" aria-label="Search admin">
                <FontAwesomeIcon icon={faMagnifyingGlass} className="admin-global-search__icon" />
                <input
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search everything"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") closeSearch();
                  }}
                />
              </label>
              {query ? (
                <button
                  type="button"
                  className="admin-icon-button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchInputRef.current?.focus();
                  }}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        <main id="admin-main-content" className="admin-content" tabIndex={-1}>
          <div className="admin-content__inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
