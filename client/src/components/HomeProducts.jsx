import { useInfiniteQuery } from "@tanstack/react-query";
import { items } from "../api/index.js";
import { t } from "../i18n/index.js";
import Button from "./Button.jsx";
import Container from "./Container.jsx";
import Skeleton from "./Skeleton.jsx";
import ProductTile from "./ProductTile.jsx";
import styles from "./HomeProducts.module.css";

// A multiple of 2, 3, 4 and 6 so every row of the grid is full at every screen width.
export const PAGE_SIZE = 24;

const uniqueById = (pages) => {
  const seen = new Set();
  return pages.flatMap((page) => page.items).filter((item) => !seen.has(item.id) && seen.add(item.id));
};

function TileSkeleton() {
  return (
    <li className={styles.cell} aria-hidden="true">
      <div className={styles.skeleton}>
        <Skeleton width="100%" height="100%" radius="0" />
      </div>
    </li>
  );
}

export default function HomeProducts() {
  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, isFetchNextPageError } = useInfiniteQuery({
    queryKey: ["home-products", PAGE_SIZE],
    queryFn: ({ pageParam }) => items.getHome({ limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: 60_000
  });

  const products = data ? uniqueById(data.pages) : [];
  if (!isPending && products.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="home-products-title">
      <Container>
        <h2 id="home-products-title" className={styles.heading}>
          {t("home.products")}
        </h2>
        <ul className={styles.grid} aria-busy={isPending} aria-label={isPending ? t("home.productsLoading") : undefined}>
          {isPending
            ? Array.from({ length: 6 }, (_, i) => <TileSkeleton key={i} />)
            : products.map((item) => (
                <li key={item.id} className={styles.cell}>
                  <ProductTile item={item} />
                </li>
              ))}
        </ul>
        {isFetchNextPageError && (
          <p className={styles.error} role="alert">
            {t("home.productsFailed")}
          </p>
        )}
        {hasNextPage && (
          <div className={styles.more}>
            <Button variant="secondary" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
              {isFetchingNextPage ? t("home.productsLoadingMore") : isFetchNextPageError ? t("home.productsRetry") : t("home.productsMore")}
            </Button>
          </div>
        )}
      </Container>
    </section>
  );
}
