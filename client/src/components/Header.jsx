import { useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { faBars, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useUiStore } from "../stores/ui.js";
import { FOCUSABLE_WITH_FIELDS, useFocusTrap } from "../hooks/useFocusTrap.js";
import { Logo, Container, IconButton } from "@epicmkt/ui";
import LocationButton from "./LocationButton.jsx";
import HeaderSaved from "./saved/HeaderSaved.jsx";
import { useSavedDrawer } from "./saved/useSavedDrawer.js";
import MenuPanel, { MENU_ID } from "./MenuPanel.jsx";
import SearchPanel from "./SearchPanel.jsx";
import styles from "./Header.module.css";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const menuOpen = useUiStore((s) => s.menuOpen);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const { isOpen: savedOpen } = useSavedDrawer();
  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);
  const menuSearchRef = useRef(null);
  const searchPanelRef = useRef(null);
  const searchInputRef = useRef(null);
  const wasMenu = useRef(false);
  const wasSearch = useRef(false);
  // Where focus goes back to when search closes without the menu behind it (the home page search bar, say).
  const returnTo = useRef(null);
  const opening = useRef(false);
  const quiet = useRef(false);
  const pending = useRef(null);
  const inMenu = Boolean(location.state?.menu);
  const inSearch = Boolean(location.state?.search);

  useEffect(() => {
    if (location.state?.menu || location.state?.search || location.state?.saved) navigate(location, { replace: true, state: null });
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

  // From the menu's search box: search opens over the menu, and closing it goes back to the menu. Anywhere else opens search on
  // its own (hooks/useOpenSearch.js), so the menu never flashes open behind it.
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
      const from = document.activeElement;
      returnTo.current = from && from !== document.body && !rootRef.current?.contains(from) ? from : null;
      searchInputRef.current?.focus({ preventScroll: true });
    } else if (wasSearch.current) {
      wasSearch.current = false;
      if (menuOpen) {
        quiet.current = true;
        menuSearchRef.current?.focus({ preventScroll: true });
        quiet.current = false;
      } else if (returnTo.current?.isConnected) {
        returnTo.current.focus({ preventScroll: true });
      }
      returnTo.current = null;
    }
  }, [searchOpen]);

  useFocusTrap({
    active: menuOpen || searchOpen,
    getContainer: () => (searchOpen ? searchPanelRef.current : rootRef.current),
    onEscape: () => (searchOpen ? closeSearch() : closeMenu()),
    selector: FOCUSABLE_WITH_FIELDS,
    skipNegativeTabIndex: true
  });

  return (
    <>
      <div ref={rootRef} className={styles.root} inert={searchOpen || savedOpen ? "" : undefined} aria-hidden={searchOpen || savedOpen ? true : undefined}>
        <header className={styles.header}>
          <Container className={styles.bar}>
            <Link to="/" className={styles.brand} aria-label="EpicMKT home">
              <Logo />
            </Link>
            <div className={styles.tools}>
              <LocationButton />
              <HeaderSaved />
              <IconButton
                ref={toggleRef}
                icon={menuOpen ? faXmark : faBars}
                label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                aria-controls={MENU_ID}
                onClick={menuOpen ? closeMenu : openMenu}
              />
            </div>
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
