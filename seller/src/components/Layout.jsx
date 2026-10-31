import { NavLink, Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { faBell, faBolt, faCalendarXmark, faCircleInfo, faCircleQuestion, faClock, faCreditCard, faEllipsis, faGear, faImages, faMoon, faQrcode, faRightFromBracket, faStore, faSun, faTag, faUser, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Button, Modal, Toaster } from "@epicmkt/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as api from "../api/index.js";
import { getTheme, setTheme, watchSystemTheme } from "../lib/theme.js";
import { useSettings } from "../state/settings.js";
import { useToasts } from "../state/toast.js";
import { DEFAULT_IDLE, idleMinutes, useIdle } from "../state/useIdle.js";
import { useRealtime } from "../lib/useRealtime.js";
import { useEffect, useState } from "react";
import { mediaUrl } from "../api/shape.js";
import { initialsOf } from "../lib/initials.js";
import ui from "../styles/ui.module.css";
import styles from "./Layout.module.css";

export const BELL_KEY = ["unread"];

// The round mark in the header: the shop's logo, or its initials until it has one (or if the file cannot load).
export function ShopMark({ name, logoPath }) {
  const src = mediaUrl(logoPath);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return (
    <span className={styles.mark} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" className={styles.markImg} onError={() => setFailed(true)} /> : initialsOf(name)}
    </span>
  );
}

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

// Shown while a seller is still on the temporary password we sent. Not a status role, so it never competes with page messages.
export function SetupNotice() {
  return (
    <section className={`${ui.banner} ${ui.tone_info}`} aria-label="Finish setting up your sign-in" data-testid="setup-banner">
      <h2>Finish setting up your sign-in</h2>
      <p>You are using the temporary password we sent you. Add your email and choose your own password so you can sign in with them.</p>
      <Link className={ui.link} to="/business/account">Go to Account</Link>
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
  // The seller's saved settings (appearance, inactivity timeout, defaults). Loaded once, then kept in the settings store.
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, retry: false, staleTime: Infinity, refetchOnWindowFocus: false });
  const loadSettings = useSettings((s) => s.load);
  const settingsLoaded = useSettings((s) => s.loaded);
  const storedIdle = useSettings((s) => s.settings.idle_minutes);
  const toasts = useToasts((s) => s.toasts);
  const dismissToast = useToasts((s) => s.dismiss);
  useEffect(() => { if (settingsQuery.data) loadSettings(settingsQuery.data); }, [settingsQuery.data, loadSettings]);
  useEffect(() => watchSystemTheme(), []);
  const ack = () => api.ackDelivered().then((n) => { if (n) qc.invalidateQueries({ queryKey: ["messages"] }); }).catch(() => {});
  useEffect(() => { ack(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime(["messages"], () => {
    qc.invalidateQueries({ queryKey: BELL_KEY });
    qc.invalidateQueries({ queryKey: ["messages"] });
    ack();
  });
  useRealtime(["businesses"], () => {
    qc.invalidateQueries({ queryKey: ["subscription"] });
    qc.invalidateQueries({ queryKey: ["shop-preview"] });
  });
  useEffect(() => { setMore(false); }, [pathname]);
  useEffect(() => {
    if (!more) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setMore(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [more]);
  // A suspended seller can read notices, answer staff, and see and make their payments. Nothing else.
  // The bare /business address is allowed so it can send a suspended seller on to Notifications.
  const allowed = !suspended || /^\/business\/(notifications|questions|subscription)/.test(pathname) || /^\/business\/?$/.test(pathname);
  const moreActive = /^\/business\/(hours|exceptions|flash|offers|qr|gallery|team|account|settings|help|onboarding)/.test(pathname);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
    const st = useSettings.getState();
    if (st.loaded && st.settings.appearance.theme !== next) st.update({ appearance: { theme: next } }, { quiet: true });
  };
  // The saved choice can change from Settings (or arrive from another device), so follow it.
  const savedTheme = useSettings((s) => (s.loaded ? s.settings.appearance.theme : null));
  useEffect(() => { setThemeState(getTheme()); }, [savedTheme]);
  const signOut = async () => {
    await api.logout();
    qc.clear();
    useSettings.getState().reset();
    navigate("/login");
  };
  const idle = useIdle({ minutes: idleMinutes(settingsLoaded ? storedIdle : DEFAULT_IDLE), active: Boolean(business), onTimeout: signOut });

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        {/* The shop mark and name open My listings (a suspended seller cannot open it, so they go to Notifications). */}
        <Link to={suspended ? "/business/notifications" : "/business/catalog"} className={styles.brand}>
          <ShopMark name={business?.name} logoPath={business?.logoPath} />
          <span className={styles.brandText}>
            <strong className={styles.shop} data-testid="shop-name">{business?.name ?? "Your shop"}</strong>
            <span className={styles.app}>EpicMKT Seller</span>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Business">
          <div className={styles.primary}>
            {!suspended && <Item to="/business/catalog" icon={faStore}>My listings</Item>}
            <Item to="/business/subscription" icon={faCreditCard}>Subscription</Item>
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
            <div id="more-links" className={styles.moreLinks} data-open={more}>
              <Item to="/business/hours" icon={faClock}>Opening hours</Item>
              <Item to="/business/exceptions" icon={faCalendarXmark}>Exceptions</Item>
              <Item to="/business/flash" icon={faBolt}>Flash sales</Item>
              <Item to="/business/offers" icon={faTag}>Offers</Item>
              <Item to="/business/gallery" icon={faImages}>Gallery</Item>
              <Item to="/business/team" icon={faUsers}>Team and schedule</Item>
              <Item to="/business/qr" icon={faQrcode}>QR poster</Item>
              <Item to="/business/account" icon={faUser}>Account</Item>
              <Item to="/business/settings" icon={faGear}>Settings</Item>
              <Item to="/business/help" icon={faCircleInfo}>Help</Item>
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
            <p>{business.statusReason ? `Reason: ${business.statusReason}` : "EpicMKT suspended your account."} Your listing is hidden and you cannot change anything. You can still see your payments and pay under Subscription, read your notifications and answer EpicMKT under Questions.</p>
          </div>
        )}
        {!suspended && business?.mustChangePassword && !pathname.startsWith("/business/account") && <SetupNotice />}
        {allowed ? <Outlet /> : <p className={ui.muted} data-testid="locked">This page is not available while your account is suspended.</p>}
      </main>
      {/* Only mounted while there is a message, so it never adds a second status region to a page. */}
      {toasts.length > 0 && <Toaster toasts={toasts} onDismiss={dismissToast} />}
      <Modal open={idle.warning} onClose={idle.stay} labelledBy="idle-title">
        <div className={styles.idle}>
          <h2 id="idle-title">Are you still there?</h2>
          <p>You will be signed out in {idle.remaining ?? 0} seconds because of inactivity.</p>
          <div className={styles.idleActions}>
            <Button onClick={idle.stay}>Stay signed in</Button>
            <Button variant="secondary" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
