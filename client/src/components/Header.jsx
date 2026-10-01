import { useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { faBars, faXmark, faHouse, faTableCells } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useUiStore } from "../stores/ui.js";
import Container from "./Container.jsx";
import Logo from "./Logo.jsx";
import IconButton from "./IconButton.jsx";
import Drawer from "./Drawer.jsx";
import styles from "./Header.module.css";

const links = [
  { to: "/", label: "Home", icon: faHouse, end: true },
  { to: "/#categories", label: "Categories", icon: faTableCells, end: false }
];

export default function Header() {
  const { pathname, hash } = useLocation();
  const menuOpen = useUiStore((s) => s.menuOpen);
  const openMenu = useUiStore((s) => s.openMenu);
  const closeMenu = useUiStore((s) => s.closeMenu);

  useEffect(() => {
    closeMenu();
  }, [pathname, hash, closeMenu]);

  return (
    <header className={styles.header}>
      <Container className={styles.bar}>
        <Link to="/" className={styles.brand} aria-label="EpicMKT home">
          <Logo />
        </Link>
        <nav className={styles.nav} aria-label="Main">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={styles.link}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <IconButton icon={faBars} label="Open menu" className={styles.menuButton} onClick={openMenu} />
      </Container>
      <Drawer open={menuOpen} onClose={closeMenu} label="Menu">
        <div className={styles.drawerTop}>
          <Logo />
          <IconButton icon={faXmark} label="Close menu" onClick={closeMenu} />
        </div>
        <nav className={styles.drawerNav} aria-label="Menu">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className={styles.drawerLink}>
              <FontAwesomeIcon icon={link.icon} className={styles.drawerIcon} />
              {link.label}
            </Link>
          ))}
        </nav>
      </Drawer>
    </header>
  );
}
