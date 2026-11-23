import { Suspense, lazy, useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";
import { savedScroll, saveScroll } from "../lib/resultsMemory.js";
import { useUiStore } from "../stores/ui.js";
import { onSavedOpenRequest } from "../stores/savedUi.js";
import { useGeoStore } from "../stores/geo.js";
import { useRouteSeo } from "../hooks/useRouteSeo.js";
import LocationDialog from "./LocationDialog.jsx";
import Toaster from "./Toaster.jsx";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import { BackToTop } from "@epicmkt/ui";
import { scrollToTop } from "../lib/scrollToTop.js";
import OfflineBanner from "./OfflineBanner.jsx";
import UpdatePrompt from "./UpdatePrompt.jsx";
import { loadSavedDrawer } from "./saved/lazy.js";
import { useSavedDrawer } from "./saved/useSavedDrawer.js";
import styles from "./Layout.module.css";

const SavedDrawer = lazy(loadSavedDrawer);

export default function Layout() {
  const { pathname, hash, key } = useLocation();
  const navType = useNavigationType();
  const { state } = useLocation();
  const current = useRef({ key, pathname });
  current.current = { key, pathname };
  const menuOpen = useUiStore((s) => s.menuOpen);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const { isOpen: savedOpen, open: openSaved } = useSavedDrawer();
  useEffect(() => onSavedOpenRequest(openSaved), [openSaved]);
  const layered = menuOpen || searchOpen || savedOpen;
  const behind = layered ? { inert: "", "aria-hidden": true } : {};

  useRouteSeo();

  useEffect(() => {
    useGeoStore.getState().restore();
  }, []);

  useEffect(() => {
    const onScroll = () => saveScroll(current.current.key, current.current.pathname, window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // Changing a filter rewrites the address in place; the page must stay where the shopper is reading.
    if (navType === "REPLACE" && state?.keepScroll) return undefined;
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
      return undefined;
    }
    const top = navType === "POP" ? savedScroll(key) ?? 0 : 0;
    window.scrollTo(0, top);
    if (!top) return undefined;
    const frame = requestAnimationFrame(() => window.scrollTo(0, top));
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, key]);

  useEffect(() => {
    document.documentElement.style.overflow = layered ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [layered]);

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip} {...behind}>
        Skip to content
      </a>
      <Header />
      <div className={styles.content} {...behind}>
        <OfflineBanner />
        <main id="main" tabIndex={-1} className={styles.main}>
          <div className={styles.page}>
            <Outlet />
          </div>
          <Footer />
        </main>
      </div>
      <BackToTop onTop={scrollToTop} hidden={layered} lifted={/^\/b\/[^/]+\/i\//.test(pathname)} />
      <UpdatePrompt />
      {savedOpen && (
        <Suspense fallback={null}>
          <SavedDrawer />
        </Suspense>
      )}
      <LocationDialog />
      <Toaster />
    </div>
  );
}
