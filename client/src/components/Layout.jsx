import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";
import { savedScroll, saveScroll } from "../lib/resultsMemory.js";
import { useUiStore } from "../stores/ui.js";
import { useGeoStore } from "../stores/geo.js";
import LocationDialog from "./LocationDialog.jsx";
import { Toaster } from "@epicmkt/ui";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import OfflineBanner from "./OfflineBanner.jsx";
import UpdatePrompt from "./UpdatePrompt.jsx";
import styles from "./Layout.module.css";

export default function Layout() {
  const mainRef = useRef(null);
  const { pathname, hash, key } = useLocation();
  const navType = useNavigationType();
  const current = useRef({ key, pathname });
  current.current = { key, pathname };
  const menuOpen = useUiStore((s) => s.menuOpen);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const layered = menuOpen || searchOpen;
  const behind = layered ? { inert: "", "aria-hidden": true } : {};

  useEffect(() => {
    useGeoStore.getState().restore();
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    const onScroll = () => saveScroll(current.current.key, current.current.pathname, main.scrollTop);
    main?.addEventListener("scroll", onScroll, { passive: true });
    return () => main?.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
      return undefined;
    }
    const top = navType === "POP" ? savedScroll(key) ?? 0 : 0;
    mainRef.current?.scrollTo(0, top);
    if (!top) return undefined;
    const frame = requestAnimationFrame(() => mainRef.current?.scrollTo(0, top));
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
        <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
          <div className={styles.page}>
            <Outlet />
          </div>
          <Footer />
        </main>
      </div>
      <UpdatePrompt />
      <LocationDialog />
      <Toaster />
    </div>
  );
}
