import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useUiStore } from "../stores/ui.js";
import { useGeoStore } from "../stores/geo.js";
import LocationDialog from "./LocationDialog.jsx";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import OfflineBanner from "./OfflineBanner.jsx";
import UpdatePrompt from "./UpdatePrompt.jsx";
import styles from "./Layout.module.css";

export default function Layout() {
  const mainRef = useRef(null);
  const { pathname, hash } = useLocation();
  const menuOpen = useUiStore((s) => s.menuOpen);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const layered = menuOpen || searchOpen;
  const behind = layered ? { inert: "", "aria-hidden": true } : {};

  useEffect(() => {
    useGeoStore.getState().restore();
  }, []);

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else mainRef.current?.scrollTo(0, 0);
  }, [pathname, hash]);

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
    </div>
  );
}
