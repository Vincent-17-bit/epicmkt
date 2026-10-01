import { Link, useMatch } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faStore, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { getCategories } from "../api/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";
import Container from "./Container.jsx";
import Button from "./Button.jsx";
import IconButton from "./IconButton.jsx";
import Skeleton from "./Skeleton.jsx";
import ThemeSwitch from "./ThemeSwitch.jsx";
import styles from "./MenuPanel.module.css";

export const MENU_ID = "site-menu";

const SELLER_URL = import.meta.env.VITE_SELLER_URL || "/seller/";

const smallLinks = [
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
  { to: "/faq", label: "FAQs" }
];

export default function MenuPanel({ open, onClose, panelRef, onOpenSearch, searchRef, quietRef }) {
  const activeSlug = useMatch("/c/:slug")?.params.slug;
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 5 * 60_000
  });

  const submit = (event) => {
    event.preventDefault();
    onOpenSearch();
  };

  const hidden = open ? undefined : "";

  return (
    <>
      <button type="button" tabIndex={-1} aria-hidden="true" data-open={open} className={styles.scrim} onClick={onClose} />
      <div
        id={MENU_ID}
        ref={panelRef}
        role="region"
        aria-label="Menu"
        tabIndex={-1}
        data-open={open}
        inert={hidden}
        aria-hidden={open ? undefined : true}
        className={styles.panel}
      >
        <Container className={styles.inner}>
          <form role="search" className={`${styles.search} ${styles.areaSearch}`} onSubmit={submit}>
            <label htmlFor="menu-search" className={styles.srOnly}>
              Search businesses
            </label>
            <input
              id="menu-search"
              ref={searchRef}
              type="search"
              readOnly
              inputMode="none"
              autoComplete="off"
              placeholder="Search businesses"
              onFocus={() => {
                if (!quietRef.current) onOpenSearch();
              }}
              onClick={onOpenSearch}
              className={styles.input}
            />
            <IconButton type="submit" icon={faMagnifyingGlass} label="Search" className={styles.submit} />
          </form>

          <Button as="a" href={SELLER_URL} size="lg" icon={faStore} className={`${styles.seller} ${styles.areaSeller}`}>
            Become a seller
          </Button>

          <section aria-labelledby="menu-categories" className={styles.areaCats}>
            <h2 id="menu-categories" className={styles.label}>
              Categories
            </h2>
            {isError ? (
              <div className={styles.error}>
                <p>Categories could not be loaded.</p>
                <Button size="sm" variant="secondary" icon={faRotateRight} onClick={() => refetch()}>
                  Try again
                </Button>
              </div>
            ) : (
              <ul className={styles.cats}>
                {isPending
                  ? Array.from({ length: 6 }, (_, i) => (
                      <li key={i} aria-hidden="true">
                        <Skeleton height="52px" radius="var(--radius-card)" />
                      </li>
                    ))
                  : data.map((category) => (
                      <li key={category.id}>
                        <Link
                          to={`/c/${category.id}`}
                          replace
                          className={styles.cat}
                          aria-current={activeSlug === category.id ? "page" : undefined}
                        >
                          <span className={styles.catIcon}>
                            <FontAwesomeIcon icon={categoryIcon(category.icon)} />
                          </span>
                          <span className={styles.catName}>{category.name}</span>
                        </Link>
                      </li>
                    ))}
              </ul>
            )}
          </section>

          <nav aria-label="More" className={`${styles.links} ${styles.areaLinks}`}>
            {smallLinks.map((link) => (
              <Link key={link.to} to={link.to} replace className={styles.small}>
                {link.label}
              </Link>
            ))}
          </nav>

          <ThemeSwitch className={styles.areaTheme} />
        </Container>
      </div>
    </>
  );
}
