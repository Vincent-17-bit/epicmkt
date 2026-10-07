import { useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { faBars, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useUiStore } from "../stores/ui.js";
import { IconButton, Container } from "@epicmkt/ui";
import Logo from "./Logo.jsx";
import MenuPanel, { MENU_ID } from "./MenuPanel.jsx";
import SearchPanel from "./SearchPanel.jsx";
import styles from "./Header.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const menuOpen = useUiStore((s) => s.menuOpen);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);
  const menuSearchRef = useRef(null);
  const searchPanelRef = useRef(null);
  const searchInputRef = useRef(null);
  const wasMenu = useRef(false);
  const wasSearch = useRef(false);
  const opening = useRef(false);
  const quiet = useRef(false);
  const pending = useRef(null);
  const inMenu = Boolean(location.state?.menu);
  const inSearch = Boolean(location.state?.search);

  useEffect(() => {
    if (location.state?.menu || location.state?.search) navigate(location, { replace: true, state: null });
  }, []);

  useEffect(() => {
    setMenuOpen(inMenu);
  }, [inMenu, setMenuOpen]);

  useEffect(() => {
    opening.current = false;
    setSearchOpen(inSearch);
  }, [inSearch, setSearchOpen]);

  const to = { pathname: location.pathname, search: location.search, hash: location.hash };

  const openMenu = useCallback(() => {
    navigate(to, { state: { menu: true } });
  }, [navigate, location.pathname, location.search, location.hash]);

  const closeMenu = useCallback(() => {
    if (inMenu && !inSearch) navigate(-1);
  }, [navigate, inMenu, inSearch]);

  const openSearch = useCallback(() => {
    if (inSearch || opening.current) return;
    opening.current = true;
    navigate(to, { state: { menu: true, search: true } });
  }, [navigate, inSearch, location.pathname, location.search, location.hash]);

  const closeSearch = useCallback(() => {
    if (inSearch) navigate(-1);
  }, [navigate, inSearch]);

  const select = useCallback(
    (target) => {
      pending.current = target;
      closeSearch();
    },
    [closeSearch]
  );

  useEffect(() => {
    if (!pending.current || inSearch) return;
    const target = pending.current;
    pending.current = null;
    navigate(target, { replace: true });
  }, [location.key, inSearch, navigate]);

  useEffect(() => {
    if (menuOpen) {
      wasMenu.current = true;
      if (!searchOpen) panelRef.current?.focus({ preventScroll: true });
    } else if (wasMenu.current) {
      wasMenu.current = false;
      toggleRef.current?.focus({ preventScroll: true });
    }
  }, [menuOpen]);

  useEffect(() => {
    if (searchOpen) {
      wasSearch.current = true;
      searchInputRef.current?.focus({ preventScroll: true });
    } else if (wasSearch.current) {
      wasSearch.current = false;
      if (menuOpen) {
        quiet.current = true;
        menuSearchRef.current?.focus({ preventScroll: true });
        quiet.current = false;
      }
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!menuOpen && !searchOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        if (searchOpen) closeSearch();
        else closeMenu();
        return;
      }
      if (event.key !== "Tab") return;
      const layer = searchOpen ? searchPanelRef.current : rootRef.current;
      const nodes = [...layer.querySelectorAll(FOCUSABLE)].filter(
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
  }, [menuOpen, searchOpen, closeMenu, closeSearch]);

  return (
    <>
      <div ref={rootRef} className={styles.root} inert={searchOpen ? "" : undefined} aria-hidden={searchOpen ? true : undefined}>
        <header className={styles.header}>
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
              onClick={menuOpen ? closeMenu : openMenu}
            />
          </Container>
        </header>
        <MenuPanel
          open={menuOpen}
          onClose={closeMenu}
          panelRef={panelRef}
          onOpenSearch={openSearch}
          searchRef={menuSearchRef}
          quietRef={quiet}
        />
      </div>
      <SearchPanel open={searchOpen} onClose={closeSearch} onSelect={select} panelRef={searchPanelRef} inputRef={searchInputRef} />
    </>
  );
}
