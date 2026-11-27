import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { faBars, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useUiStore } from "../stores/ui.js";
import { FOCUSABLE_WITH_FIELDS, useFocusTrap } from "../hooks/useFocusTrap.js";
import { Logo, Container, IconButton } from "@epicmkt/ui";
import LocationButton from "./LocationButton.jsx";
import { MENU_ID, SEARCH_ID } from "./panelIds.js";
import HeaderSaved from "./saved/HeaderSaved.jsx";
import { useSavedDrawer } from "./saved/useSavedDrawer.js";
import styles from "./Header.module.css";

const loadPanels = () => Promise.all([import("./MenuPanel.jsx"), import("./SearchPanel.jsx")]).then(([menu, search]) => ({ Menu: menu.default, Search: search.default }));
const whenIdle = (fn) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500));
const cancelIdle = (id) => (typeof cancelIdleCallback === "function" ? cancelIdleCallback(id) : clearTimeout(id));

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
  const [panels, setPanels] = useState(null);
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
    if (panels) return;
    const load = () => loadPanels().then(setPanels);
    if (menuOpen || searchOpen) {
      load();
      return;
    }
    const id = whenIdle(load);
    return () => cancelIdle(id);
  }, [panels, menuOpen, searchOpen]);

  useEffect(() => {
    if (menuOpen) {
      wasMenu.current = true;
      if (!searchOpen) panelRef.current?.focus({ preventScroll: true });
    } else if (wasMenu.current) {
      wasMenu.current = false;
      toggleRef.current?.focus({ preventScroll: true });
    }
  }, [menuOpen, panels]);

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
  }, [searchOpen, panels]);

  useFocusTrap({
    active: menuOpen || searchOpen,
    getContainer: () => (searchOpen ? searchPanelRef.current : rootRef.current),
    onEscape: () => (searchOpen ? closeSearch() : closeMenu()),
    selector: FOCUSABLE_WITH_FIELDS,
    skipNegativeTabIndex: true
  });

  return (
    <>
      <div ref={rootRef} className={styles.root} inert={savedOpen ? "" : undefined} aria-hidden={savedOpen ? true : undefined}>
        <header className={styles.header}>
          <Container className={styles.bar}>
            <Link to="/" className={styles.brand} aria-label="EpicMKT home" inert={searchOpen ? "" : undefined} aria-hidden={searchOpen ? true : undefined}>
              <Logo />
            </Link>
            <div className={styles.tools}>
              <div className={styles.locate} inert={searchOpen ? "" : undefined} aria-hidden={searchOpen ? true : undefined}>
                <LocationButton />
              </div>
              <HeaderSaved />
              <IconButton
                ref={toggleRef}
                icon={menuOpen || searchOpen ? faXmark : faBars}
                label={searchOpen ? "Dismiss search" : menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={searchOpen ? true : menuOpen}
                aria-controls={searchOpen ? SEARCH_ID : MENU_ID}
                onClick={searchOpen ? closeSearch : menuOpen ? closeMenu : openMenu}
              />
            </div>
          </Container>
        </header>
        <div className={styles.root} inert={searchOpen ? "" : undefined} aria-hidden={searchOpen ? true : undefined}>
          {panels && (
            <panels.Menu open={menuOpen} onClose={closeMenu} panelRef={panelRef} onOpenSearch={openSearch} searchRef={menuSearchRef} quietRef={quiet} />
          )}
        </div>
      </div>
      {panels && <panels.Search open={searchOpen} onClose={closeSearch} onSelect={select} panelRef={searchPanelRef} inputRef={searchInputRef} />}
    </>
  );
}
