import { Link, useMatch } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowTrendUp, faBolt, faMagnifyingGlass, faStore, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { resizeImageUrl } from "@epicmkt/shared";
import { flash, getCategories } from "../api/index.js";
import { addRecent } from "../lib/recentSearches.js";
import Flame from "./Flame.jsx";
import TrendTabs, { TrendKind, TrendNote } from "./TrendTabs.jsx";
import { trendLabel, trendPath, useTrending } from "../hooks/useTrending.js";
import { t } from "../i18n/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";
import { routes } from "../config/routes.js";
import { infoLinks } from "../config/nav.js";
import { Container, Button, IconButton, Skeleton } from "@epicmkt/ui";
import ThemeSwitch from "./ThemeSwitch.jsx";
import styles from "./MenuPanel.module.css";

export const MENU_ID = "site-menu";

export default function MenuPanel({ open, onClose, panelRef, onOpenSearch, searchRef, quietRef }) {
  const activeSlug = useMatch("/c/:slug")?.params.slug;
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 60_000
  });

  const { data: flashFacets } = useQuery({
    queryKey: ["flash-facets"],
    queryFn: flash.facets,
    staleTime: 30_000,
    refetchInterval: 60_000
  });

  // What shoppers search for, every kind in one ranking: popular this week and rising now, rebuilt every hour (migration 0146).
  const { query: trending, tab, setTab, list: trend, real, filler, hasRising, scopeNote } = useTrending({ enabled: open });

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
        aria-label={t("menu.label")}
        tabIndex={-1}
        data-open={open}
        inert={hidden}
        aria-hidden={open ? undefined : true}
        className={styles.panel}
      >
        <Container className={styles.inner}>
          <form role="search" className={`${styles.search} ${styles.areaSearch}`} onSubmit={submit}>
            <label htmlFor="menu-search" className="sr-only">
              {t("menu.searchLabel")}
            </label>
            <input
              id="menu-search"
              ref={searchRef}
              type="search"
              readOnly
              inputMode="none"
              autoComplete="off"
              placeholder={t("menu.searchPlaceholder")}
              onFocus={() => {
                if (!quietRef.current) onOpenSearch();
              }}
              onClick={onOpenSearch}
              className={styles.input}
            />
            <IconButton type="submit" icon={faMagnifyingGlass} label={t("menu.searchButton")} className={styles.submit} />
          </form>

          {(trending.isPending || trend.length > 0) && (
            <section aria-labelledby="menu-trending" className={`${styles.trending} ${styles.areaTrend}`}>
              <div className={styles.trendHead}>
                <h2 id="menu-trending" className={styles.label}>
                  <FontAwesomeIcon icon={faArrowTrendUp} aria-hidden="true" /> Trending searches
                </h2>
              </div>
              <TrendTabs tab={tab} onChange={setTab} hasRising={hasRising} />
              {scopeNote && <TrendNote>{scopeNote}</TrendNote>}
              <ol className={styles.trendList}>
                {trending.isPending
                  ? Array.from({ length: 6 }, (_, i) => (
                      <li key={i} aria-hidden="true">
                        <Skeleton width={`${5 + (i % 3) * 1.5}rem`} height="34px" radius="999px" />
                      </li>
                    ))
                  : real.map((item, index) => (
                      <li key={item.term}>
                        <Link
                          to={trendPath(item, `/products?q=${encodeURIComponent(item.term)}`)}
                          replace
                          className={styles.trend}
                          onClick={() => addRecent(item.term)}
                        >
                          <span className={styles.trendRank} data-top={index < 3 || undefined}>{index + 1}</span>
                          {item.image ? (
                            <img className={styles.trendImg} src={resizeImageUrl(item.image, 64)} alt="" width="22" height="22" loading="lazy" decoding="async" />
                          ) : null}
                          <span className={styles.trendTerm}>{trendLabel(item)}</span>
                          <TrendKind kind={item.kind} />
                          {item.hot && <Flame className={styles.trendFire} />}
                        </Link>
                      </li>
                    ))}
              </ol>
              {!trending.isPending && filler.length > 0 && (
                <>
                  <h3 className={styles.moreLabel}>Popular products</h3>
                  <ol className={styles.trendList}>
                    {filler.map((item) => (
                      <li key={item.term}>
                        <Link to={trendPath(item, `/products?q=${encodeURIComponent(item.term)}`)} replace className={styles.trend} onClick={() => addRecent(item.term)}>
                          {item.image ? <img className={styles.trendImg} src={resizeImageUrl(item.image, 64)} alt="" width="22" height="22" loading="lazy" decoding="async" /> : null}
                          <span className={styles.trendTerm}>{trendLabel(item)}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          )}

          <div className={`${styles.sellerStack} ${styles.areaSeller}`}>
            <Button as={Link} to={routes.apply} size="lg" icon={faStore} className={styles.seller}>
              {t("nav.becomeASeller")}
            </Button>
            <Link to="/flash" replace className={styles.flashLink}>
              <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
              <span>{t("flash.title")}</span>
              {flashFacets?.total > 0 && <span className={styles.flashCount}>{flashFacets.total}</span>}
            </Link>
          </div>

          <section aria-labelledby="menu-categories" className={styles.areaCats}>
            <h2 id="menu-categories" className={styles.label}>
              {t("menu.categories")}
            </h2>
            {isError ? (
              <div className={styles.error}>
                <p>{t("menu.categoriesError")}</p>
                <Button size="sm" variant="secondary" icon={faRotateRight} onClick={() => refetch()}>
                  {t("menu.retry")}
                </Button>
              </div>
            ) : (
              <ul className={styles.cats}>
                {isPending
                  ? Array.from({ length: 6 }, (_, i) => (
                      <li key={i} aria-hidden="true">
                        <Skeleton height="46px" radius="var(--radius-card)" />
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

          <nav aria-label={t("menu.more")} className={`${styles.links} ${styles.areaLinks}`}>
            {infoLinks.map((link) => (
              <Link key={link.to} to={link.to} replace className={styles.small}>
                {t(link.labelKey)}
              </Link>
            ))}
          </nav>

          <ThemeSwitch className={styles.areaTheme} />
        </Container>
      </div>
    </>
  );
}
