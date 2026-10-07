import { useQuery } from "@tanstack/react-query";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { searchBusinesses } from "../api/index.js";
import BusinessCard from "./BusinessCard.jsx";
import CardGrid from "./CardGrid.jsx";
import { Button, Skeleton } from "@epicmkt/ui";
import styles from "./HomeList.module.css";

export default function HomeList({ sort, limit = 4 }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["home-list", sort, limit],
    queryFn: () => searchBusinesses({ sort, pageSize: limit }),
    staleTime: 60_000
  });

  if (isError) {
    return (
      <div className={styles.error} role="alert">
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
        {Array.from({ length: limit }, (_, i) => (
          <li key={i}>
            <Skeleton height="15rem" radius="var(--radius-card)" />
          </li>
        ))}
      </CardGrid>
    );
  }

  return (
    <CardGrid>
      {data.items.map((business) => (
        <li key={business.id}>
          <BusinessCard business={business} />
        </li>
      ))}
    </CardGrid>
  );
}
