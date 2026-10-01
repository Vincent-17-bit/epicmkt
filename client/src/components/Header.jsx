import { useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { faBars, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useUiStore } from "../stores/ui.js";
import Container from "./Container.jsx";
import Logo from "./Logo.jsx";
import IconButton from "./IconButton.jsx";
import MenuPanel, { MENU_ID } from "./MenuPanel.jsx";
import styles from "./Header.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const menuOpen = useUiStore((s) => s.menuOpen);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);
  const headerRef = useRef(null);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);
  const wasOpen = useRef(false);
  const inHistory = Boolean(location.state?.menu);

  useEffect(() => {
    if (location.state?.menu) navigate(location, { replace: true, state: null });
  }, []);

  useEffect(() => {
    setMenuOpen(inHistory);
  }, [inHistory, setMenuOpen]);

  const open = useCallback(() => {
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { state: { menu: true } });
  }, [navigate, location.pathname, location.search, location.hash]);

  const close = useCallback(() => {
    if (inHistory) navigate(-1);
  }, [navigate, inHistory]);

  useEffect(() => {
    if (menuOpen) {
      wasOpen.current = true;
      panelRef.current?.focus({ preventScroll: true });
    } else if (wasOpen.current) {
      wasOpen.current = false;
      toggleRef.current?.focus({ preventScroll: true });
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [...headerRef.current.querySelectorAll(FOCUSABLE)].filter(
        (node) => node.tabIndex >= 0 && node.getClientRects().length > 0
      );
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, close]);

  return (
    <header ref={headerRef} className={styles.header}>
      <Container className={styles.bar}>
        <Link to="/" className={styles.brand} aria-label="EpicMKT home">
          <Logo />
        </Link>
        <IconButton
          ref={toggleRef}
          icon={menuOpen ? faXmark : faBars}
          label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls={MENU_ID}
          onClick={menuOpen ? close : open}
        />
      </Container>
      <MenuPanel open={menuOpen} onClose={close} panelRef={panelRef} />
    </header>
  );
}
