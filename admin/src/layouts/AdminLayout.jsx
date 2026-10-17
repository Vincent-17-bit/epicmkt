import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faBuilding,
  faChevronLeft,
  faChevronRight,
  faCreditCard,
  faFileLines,
  faGauge,
  faGear,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useMediaQuery } from "../lib/useMediaQuery.js";

const THEME_KEY = "epicmkt-admin-theme";
const SIDEBAR_KEY = "epicmkt-admin-sidebar";
const SIDEBAR_ID = "admin-sidebar";
const TOOLTIP_ID = "admin-sidebar-tooltip";
const SWIPE_CLOSE_PX = 60;

const navItems = [
  { label: "Command Center", to: "/admin", end: true, badge: "12", icon: faGauge },
  { label: "Applications", to: "/admin/applications", badge: "7", icon: faFileLines },
  { label: "Businesses", to: "/admin/businesses", badge: "64", icon: faBuilding },
  { label: "Payments", to: "/admin/payments", badge: "3", icon: faCreditCard },
  { label: "Settings", to: "/admin/settings", icon: faGear },
];

const STATUS_TEXT = "System healthy · Last sync 4 mins ago";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode, quota) - the preference just won't persist */
  }
}

function readTheme() {
  const saved = readStored(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function miniBadge(value) {
  return Number(value) > 99 ? "99+" : value;
}

export default function AdminLayout() {
  const { pathname } = useLocation();

  // Mode is state, not CSS-hidden text: desktop >=1024, tablet 768-1023, mobile <768.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isMobileViewport = useMediaQuery("(max-width: 767.98px)");
  const mode = isDesktop ? "desktop" : isMobileViewport ? "mobile" : "tablet";
  const isMobile = mode === "mobile";

  const [theme, setTheme] = useState(readTheme);
  const [collapsed, setCollapsed] = useState(() => readStored(SIDEBAR_KEY) === "collapsed");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tip, setTip] = useState(null);

  const overlayOpen = mode !== "desktop" && drawerOpen;
  const isRail = mode === "desktop" ? collapsed : mode === "tablet" ? !drawerOpen : false;

  const sidebarRef = useRef(null);
  const toggleRef = useRef(null);
  const hamburgerRef = useRef(null);
  const returnFocusRef = useRef(null);
  const wasOverlayOpenRef = useRef(false);
  const touchStartRef = useRef(null);

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    writeStored(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    writeStored(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  const openDrawer = useCallback(() => {
    returnFocusRef.current = document.activeElement;
    setDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Close on route change, and whenever the layout mode changes (e.g. rotating a tablet).
  useEffect(() => {
    setDrawerOpen(false);
    setTip(null);
  }, [pathname, mode]);

  // While an overlay drawer is open: lock scroll, close on Esc, trap Tab, move focus in.
  useEffect(() => {
    if (!overlayOpen) return undefined;

    document.documentElement.classList.add("admin-scroll-lock");

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const nodes = Array.from(sidebarRef.current.querySelectorAll(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (!sidebarRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const frame = requestAnimationFrame(() => toggleRef.current?.focus({ preventScroll: true }));

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.classList.remove("admin-scroll-lock");
    };
  }, [overlayOpen]);

  // Return focus to whatever opened the drawer (the hamburger on mobile).
  useEffect(() => {
    if (overlayOpen) {
      wasOverlayOpenRef.current = true;
      return;
    }
    if (!wasOverlayOpenRef.current) return;
    wasOverlayOpenRef.current = false;
    const remembered = returnFocusRef.current;
    const target =
      remembered && remembered.isConnected ? remembered : isMobile ? hamburgerRef.current : toggleRef.current;
    target?.focus({ preventScroll: true });
    returnFocusRef.current = null;
  }, [overlayOpen, isMobile]);

  // Rail tooltips: one fixed-position element, so the independently scrolling nav can't clip it.
  useEffect(() => {
    if (!isRail) setTip(null);
  }, [isRail]);

  useEffect(() => {
    if (!tip) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setTip(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [tip]);

  const showTip = useCallback((element, label) => {
    const rect = element.getBoundingClientRect();
    setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  }, []);
  const hideTip = useCallback(() => setTip(null), []);

  const tipProps = (label) =>
    isRail
      ? {
          onPointerEnter: (event) => {
            if (event.pointerType === "mouse") showTip(event.currentTarget, label);
          },
          onPointerLeave: hideTip,
          onFocus: (event) => {
            if (event.currentTarget.matches(":focus-visible")) showTip(event.currentTarget, label);
          },
          onBlur: hideTip,
        }
      : {};

  const swipeProps = {
    onTouchStart: (event) => {
      if (!overlayOpen) return;
      const touch = event.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    },
    onTouchEnd: (event) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || !overlayOpen) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (dx < -SWIPE_CLOSE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) setDrawerOpen(false);
    },
    onTouchCancel: () => {
      touchStartRef.current = null;
    },
  };

  // The single toggle button is a collapse control (desktop), an expand/collapse overlay
  // control (tablet) or a close button (mobile).
  let toggleLabel;
  let toggleIcon;
  let toggleExpanded;
  let onToggle;
  if (mode === "desktop") {
    toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
    toggleIcon = collapsed ? faChevronRight : faChevronLeft;
    toggleExpanded = !collapsed;
    onToggle = () => setCollapsed((value) => !value);
  } else if (mode === "tablet") {
    toggleLabel = drawerOpen ? "Collapse sidebar" : "Expand sidebar";
    toggleIcon = drawerOpen ? faChevronLeft : faChevronRight;
    toggleExpanded = drawerOpen;
    onToggle = drawerOpen ? closeDrawer : openDrawer;
  } else {
    toggleLabel = "Close menu";
    toggleIcon = faXmark;
    toggleExpanded = undefined;
    onToggle = closeDrawer;
  }

  const appClass = ["admin-app", isRail ? "is-rail" : "", overlayOpen ? "is-overlay-open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={appClass} data-mode={mode}>
      <div className="admin-sidebar-slot">
        <aside
          id={SIDEBAR_ID}
          ref={sidebarRef}
          className="admin-sidebar"
          aria-label="Sidebar"
          inert={isMobile && !drawerOpen ? "" : undefined}
          {...swipeProps}
        >
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo" aria-hidden="true">E</div>
            <div className="admin-sidebar__brand-copy">
              <strong>EpicMKT</strong>
              <span>Admin</span>
            </div>
            <button
              ref={toggleRef}
              type="button"
              className="admin-sidebar__toggle"
              aria-label={toggleLabel}
              aria-expanded={toggleExpanded}
              aria-controls={SIDEBAR_ID}
              onClick={onToggle}
              {...tipProps(toggleLabel)}
            >
              <FontAwesomeIcon icon={toggleIcon} />
            </button>
          </div>

          <nav className="admin-sidebar__nav" aria-label="Admin navigation" onScroll={hideTip}>
            {navItems.map((item) => {
              const accessibleName = item.badge ? `${item.label} (${item.badge})` : item.label;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `admin-nav-item${isActive ? " is-active" : ""}`}
                  aria-label={accessibleName}
                  onClick={closeDrawer}
                  {...tipProps(accessibleName)}
                >
                  <span className="admin-nav-item__icon" aria-hidden="true">
                    <FontAwesomeIcon icon={item.icon} fixedWidth />
                    {item.badge ? <span className="admin-nav-item__mini">{miniBadge(item.badge)}</span> : null}
                  </span>
                  <span className="admin-nav-item__label">{item.label}</span>
                  {item.badge ? (
                    <span className="admin-nav-item__badge" aria-hidden="true">{item.badge}</span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          <div className="admin-sidebar__footer">
            {isRail ? (
              <div
                className="admin-status-dot"
                role="img"
                tabIndex={0}
                aria-label={STATUS_TEXT}
                {...tipProps(STATUS_TEXT)}
              >
                <span aria-hidden="true" />
              </div>
            ) : (
              <div className="admin-system-card">
                <div className="admin-system-card__title">System Status</div>
                <div className="admin-system-card__content">
                  <span className="status-pill status-pill--healthy">Healthy</span>
                  <span>Last sync: 4 mins ago</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="admin-backdrop" aria-hidden="true" onClick={closeDrawer} {...swipeProps} />

      {isRail && tip ? (
        <div id={TOOLTIP_ID} role="tooltip" className="admin-tooltip" style={{ top: tip.top, left: tip.left }}>
          {tip.label}
        </div>
      ) : null}

      <div className="admin-main" inert={overlayOpen ? "" : undefined}>
        <header className="admin-header">
          <div className="admin-header__left">
            {isMobile ? (
              <button
                ref={hamburgerRef}
                type="button"
                className="admin-icon-button admin-hamburger"
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                aria-controls={SIDEBAR_ID}
                onClick={drawerOpen ? closeDrawer : openDrawer}
              >
                <FontAwesomeIcon icon={faBars} />
              </button>
            ) : null}
            <div className="admin-header__titles">
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
