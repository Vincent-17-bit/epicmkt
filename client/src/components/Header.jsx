import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { faBars, faXmark, faHouse, faTableCells } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useUiStore } from "../stores/ui.js";
import Container from "./Container.jsx";
import Logo from "./Logo.jsx";
import IconButton from "./IconButton.jsx";
import styles from "./Header.module.css";

const MENU_ID = "site-menu";

const links = [
  { to: "/", label: "Home", icon: faHouse, current: (pathname, hash) => pathname === "/" && !hash },
  { to: "/#categories", label: "Categories", icon: faTableCells, current: (pathname, hash) => pathname === "/" && hash === "#categories" }
];

export default function Header() {
  const { pathname, hash } = useLocation();
  const menuOpen = useUiStore((s) => s.menuOpen);
  const toggleMenu = useUiStore((s) => s.toggleMenu);
  const closeMenu = useUiStore((s) => s.closeMenu);

  useEffect(() => {
    closeMenu();
  }, [pathname, hash, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu]);

  return (
    <header className={styles.header}>
      <Container className={styles.bar}>
        <Link to="/" className={styles.brand} aria-label="EpicMKT home">
          <Logo />
        </Link>
        <IconButton
          icon={menuOpen ? faXmark : faBars}
          label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls={MENU_ID}
          onClick={toggleMenu}
        />
      </Container>
      {menuOpen && <button type="button" tabIndex={-1} aria-hidden="true" className={styles.backdrop} onClick={closeMenu} />}
      <nav id={MENU_ID} className={styles.menu} aria-label="Main" hidden={!menuOpen}>
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={styles.link}
            aria-current={link.current(pathname, hash) ? "page" : undefined}
            onClick={closeMenu}
          >
            <FontAwesomeIcon icon={link.icon} className={styles.linkIcon} />
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
