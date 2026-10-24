import { NavLink, Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faBolt, faCalendarXmark, faChevronDown, faCircleQuestion, faCreditCard, faEllipsis, faMoon, faQrcode, faRightFromBracket, faStore, faSun, faTag, faTriangleExclamation, faUser } from "@fortawesome/free-solid-svg-icons";
import * as api from "../api/index.js";
import { getTheme, setTheme } from "../lib/theme.js";
import { useRealtime } from "../lib/useRealtime.js";
import { STRIKE_LEAD, STRIKE_RISKS } from "../lib/strikes.js";
import { useEffect, useState } from "react";
import ui from "../styles/ui.module.css";
import styles from "./Layout.module.css";

export const BELL_KEY = ["unread"];

const initialsOf = (name) => (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "E";

function Item({ to, icon, children }) {
  return (
    <NavLink to={to}>
      <FontAwesomeIcon icon={icon} aria-hidden="true" />
      <span>{children}</span>
    </NavLink>
  );
}

export function Bell({ count }) {
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <NavLink to="/business/notifications" aria-label={label}>
      <FontAwesomeIcon icon={faBell} aria-hidden="true" />
      <span aria-hidden="true">Notifications</span>
      {count > 0 && (
        <span className={styles.badge} data-testid="bell-count" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </NavLink>
  );
}

export function StrikeNotice({ strikes }) {
  return (
    <section className={styles.strike} role="status" data-testid="strike-banner">
      <FontAwesomeIcon icon={faTriangleExclamation} className={styles.strikeIcon} aria-hidden="true" />
      <div className={styles.strikeBody}>
        <h2>{strikes === 1 ? "You have 1 strike" : `You have ${strikes} strikes`}</h2>
        <p>EpicMKT gives a strike when something on your listing breaks the rules. <Link className={ui.link} to="/business/notifications">See why in Notifications</Link>.</p>
        <p className={styles.lead}>{STRIKE_LEAD}</p>
        <details className={styles.risk}>
          <summary>What a suspension means<FontAwesomeIcon icon={faChevronDown} aria-hidden="true" /></summary>
          <ul>{STRIKE_RISKS.map((t) => <li key={t}>{t}</li>)}</ul>
        </details>
      </div>
    </section>
  );
}

export default function Layout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [theme, setThemeState] = useState(getTheme());
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  const unread = useQuery({ queryKey: BELL_KEY, queryFn: api.unreadCount });
  const me = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
  const business = me.data?.business;
  const suspended = business?.status === "suspended";
  const ack = () => api.ackDelivered().then((n) => { if (n) qc.invalidateQueries({ queryKey: ["messages"] }); }).catch(() => {});
  useEffect(() => { ack(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime(["messages"], () => {
    qc.invalidateQueries({ queryKey: BELL_KEY });
    qc.invalidateQueries({ queryKey: ["messages"] });
    ack();
  });
  useRealtime(["businesses"], () => qc.invalidateQueries({ queryKey: ["subscription"] }));
  useEffect(() => { setMore(false); }, [pathname]);
  useEffect(() => {
    if (!more) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setMore(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [more]);
  const allowed = !suspended || /^\/business\/(notifications|questions)/.test(pathname);
  const moreActive = /^\/business\/(exceptions|flash|offers|qr|account)/.test(pathname);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };
  const signOut = async () => {
    await api.logout();
    qc.clear();
    navigate("/login");
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to={suspended ? "/business/notifications" : "/business/subscription"} className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">{initialsOf(business?.name)}</span>
          <span className={styles.brandText}>
            <strong className={styles.shop} data-testid="shop-name">{business?.name ?? "Your shop"}</strong>
            <span className={styles.app}>EpicMKT Seller</span>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Business">
          <div className={styles.primary}>
            {!suspended && <Item to="/business/catalog" icon={faStore}>My listings</Item>}
            {!suspended && <Item to="/business/subscription" icon={faCreditCard}>Subscription</Item>}
            <Bell count={unread.data ?? 0} />
            <Item to="/business/questions" icon={faCircleQuestion}>Questions</Item>
            {!suspended && (
              <button type="button" className={styles.moreBtn} aria-expanded={more} aria-controls="more-links" data-active={moreActive} onClick={() => setMore(!more)}>
                <FontAwesomeIcon icon={faEllipsis} aria-hidden="true" />
                <span>More</span>
              </button>
            )}
          </div>
          {!suspended && (
            <div id="more-links" className={styles.secondary} data-open={more}>
              <Item to="/business/exceptions" icon={faCalendarXmark}>Exceptions</Item>
              <Item to="/business/flash" icon={faBolt}>Flash sales</Item>
              <Item to="/business/offers" icon={faTag}>Offers</Item>
              <Item to="/business/qr" icon={faQrcode}>QR poster</Item>
              <Item to="/business/account" icon={faUser}>Account</Item>
            </div>
          )}
        </nav>
        {more && <button type="button" className={styles.scrim} tabIndex={-1} aria-hidden="true" onClick={() => setMore(false)} />}
        <div className={styles.tools}>
          <button type="button" className={styles.iconBtn} onClick={toggle} aria-pressed={theme === "dark"} aria-label="Dark theme">
            <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} aria-hidden="true" />
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          <button type="button" className={styles.iconBtn} onClick={signOut}>
            <FontAwesomeIcon icon={faRightFromBracket} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      <main className={styles.main}>
        {suspended && (
          <div className={`${ui.banner} ${ui.tone_danger} ${styles.suspended}`} role="alert" data-testid="suspended-banner">
            <h2>Your account is suspended</h2>
            <p>{business.statusReason ? `Reason: ${business.statusReason}` : "EpicMKT suspended your account."} Your listing is hidden and you cannot change anything. You can read your notifications and answer EpicMKT under Questions.</p>
          </div>
        )}
        {!suspended && (business?.strikes ?? 0) > 0 && <StrikeNotice strikes={business.strikes} />}
        {allowed ? <Outlet /> : <p className={ui.muted} data-testid="locked">This page is not available while your account is suspended.</p>}
      </main>
    </div>
  );
}
