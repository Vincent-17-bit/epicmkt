import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { faRotateRight, faStore } from "@fortawesome/free-solid-svg-icons";
import { items, searchBusinesses } from "../api/index.js";
import { rotationSeed } from "../lib/rotation.js";
import { seenMemory } from "../lib/seen.js";
import { PRODUCT_POOL, createShowcasePicker } from "../lib/showcase.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { t } from "../i18n/index.js";
import Button from "../components/Button.jsx";
import Container from "../components/Container.jsx";
import PageBanner from "../components/PageBanner.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import Skeleton from "../components/Skeleton.jsx";
import StoreShowcaseCard from "../components/StoreShowcaseCard.jsx";
import styles from "./Featured.module.css";

export const FEATURED_PAGE_SIZE = 12;

// One page of featured stores, with a random window of each one's products fetched alongside so every card arrives
// complete. If the products cannot be read the stores still show, as store-only cards.
const loadPage = async ({ pageParam, seed }) => {
  const result = await searchBusinesses({ featuredOnly: true, sort: "relevance", seed, page: pageParam, pageSize: FEATURED_PAGE_SIZE });
  let pools = {};
  try {
    pools = await items.getShowcase(result.items.map((store) => store.id), { pool: PRODUCT_POOL });
  } catch {
    pools = {};
  }
  return { ...result, pools };
};

/** Every featured store, a page at a time, as the same cards the home page shows. */
export default function Featured() {
  usePageTitle(t("featured.title"));
  const seed = rotationSeed();
  const sentinel = useRef(null);
  const [picker] = useState(() => createShowcasePicker({ seen: seenMemory() }));

  const { data, isPending, isError, isFetchingNextPage, isFetchNextPageError, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery({
    queryKey: ["featured-all", seed, FEATURED_PAGE_SIZE],
    queryFn: ({ pageParam }) => loadPage({ pageParam, seed }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    staleTime: 60_000
  });

  const cards = (data?.pages ?? []).flatMap((page) =>
    page.items.map((store) => ({ store, products: picker.productsFor(store.id, page.pools[store.id]?.items ?? []) }))
  );
  const total = data?.pages[0]?.total ?? 0;
  const pageCount = data?.pages.length ?? 0;

  useEffect(() => {
    if (!pageCount) return;
    picker.commit();
    seenMemory().mark("b", cards.map(({ store }) => store.id));
  }, [pageCount, picker]);

  // Load the next page as the end of the list nears the screen; the button below is the fallback.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || isFetchNextPageError || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, pageCount]);

  return (
    <>
      <PageBanner
        crumbs={<PageBreadcrumbs />}
        icon={faStore}
        title={t("featured.title")}
        subtitle={t("featured.subtitle")}
      />
      <section className={styles.section} aria-labelledby="featured-all-title">
        <Container>
          {!isPending && !isError && cards.length > 0 && (
            <h2 id="featured-all-title" className={styles.count}>
              {total === 1 ? t("featured.countOne") : t("featured.count").replace("{count}", String(total))}
            </h2>
          )}

          {isError ? (
            <div className={styles.message} role="alert">
              <p>{t("featured.failed")}</p>
              <Button icon={faRotateRight} onClick={() => refetch()}>
                {t("home.retry")}
              </Button>
            </div>
          ) : isPending ? (
            <ul className={styles.grid} aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i}>
                  <Skeleton height="30rem" radius="var(--radius-card)" />
                </li>
              ))}
            </ul>
          ) : cards.length === 0 ? (
            <div className={styles.message}>
              <p>{t("featured.empty")}</p>
              <Button as={Link} to="/search" variant="secondary">
                {t("featured.browse")}
              </Button>
            </div>
          ) : (
            <>
              <ul className={styles.grid}>
                {cards.map(({ store, products }) => (
                  <li key={store.id}>
                    <StoreShowcaseCard business={store} products={products} />
                  </li>
                ))}
              </ul>
              <div ref={sentinel} className={styles.more}>
                {isFetchNextPageError && <p className={styles.note}>{t("featured.failed")}</p>}
                {hasNextPage && (
                  <Button variant="secondary" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
                    {isFetchingNextPage ? t("featured.loadingMore") : isFetchNextPageError ? t("home.retry") : t("featured.more")}
                  </Button>
                )}
              </div>
            </>
          )}
        </Container>
      </section>
    </>
  );
}
