import { useInfiniteQuery } from "@tanstack/react-query";
import { faRotateRight, faArrowDown, faTableCells } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import { searchBusinesses } from "../api/index.js";
import BusinessCard from "./BusinessCard.jsx";
import CardGrid from "./CardGrid.jsx";
import Button from "./Button.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./BusinessResults.module.css";

const PAGE_SIZE = 12;

function CardSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonHead}>
        <Skeleton width="48px" height="48px" radius="999px" />
        <div className={styles.skeletonLines}>
          <Skeleton width="70%" height="1.1rem" />
          <Skeleton width="50%" height="0.8rem" />
        </div>
      </div>
      <Skeleton height="0.9rem" />
      <Skeleton width="40%" height="0.9rem" />
      <Skeleton height="44px" radius="999px" />
    </div>
  );
}

export default function BusinessResults({ query = "", categoryId = null }) {
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["businesses", { query, categoryId }],
    queryFn: ({ pageParam }) => searchBusinesses({ query, categoryId, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined)
  });

  if (isError) {
    return (
      <div className={styles.state} role="alert">
        <p>We could not load businesses.</p>
        <Button icon={faRotateRight} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <CardGrid aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}>
            <CardSkeleton />
          </li>
        ))}
      </CardGrid>
    );
  }

  const items = data.pages.flatMap((page) => page.items);
  const total = data.pages[0].total;

  if (!total) {
    return (
      <div className={styles.state}>
        <p>No businesses found. Try another search or browse the categories.</p>
        <Button as={Link} to="/#categories" icon={faTableCells}>
          Browse categories
        </Button>
      </div>
    );
  }

  return (
    <>
      <p className={styles.count} aria-live="polite">
        {total} {total === 1 ? "business" : "businesses"} found
      </p>
      <CardGrid>
        {items.map((business) => (
          <li key={business.id}>
            <BusinessCard business={business} />
          </li>
        ))}
        {isFetchingNextPage &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={`more-${i}`}>
              <CardSkeleton />
            </li>
          ))}
      </CardGrid>
      {hasNextPage && (
        <div className={styles.more}>
          <Button variant="secondary" iconRight={faArrowDown} disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            Show more
          </Button>
        </div>
      )}
    </>
  );
}
