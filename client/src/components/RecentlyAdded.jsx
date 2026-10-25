import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { searchBusinesses } from "../api/index.js";
import { t } from "../i18n/index.js";
import Button from "./Button.jsx";
import Carousel from "./Carousel.jsx";
import HomeSection from "./HomeSection.jsx";
import Skeleton from "./Skeleton.jsx";
import StoreTileCard from "./StoreTileCard.jsx";
import styles from "./RecentlyAdded.module.css";

export const RECENT_LIMIT = 12;
export const SEE_ALL_PATH = "/search?sort=newest";

/** Home page: the newest businesses as compact tiles in a scrolling row, with See more going to the full list. */
export default function RecentlyAdded() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["recently-added", RECENT_LIMIT],
    queryFn: () => searchBusinesses({ sort: "newest", pageSize: RECENT_LIMIT }),
    staleTime: 60_000
  });

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;

  if (!isPending && !isError && items.length === 0) return null;

  if (isError) {
    return (
      <HomeSection>
        <div className={styles.error} role="alert">
          <p>{t("home.recentFailed")}</p>
          <Button onClick={() => refetch()}>{t("home.retry")}</Button>
        </div>
      </HomeSection>
    );
  }

  return (
    <HomeSection labelledBy="recent-title">
    <Carousel
      id="recent"
      variant="tile"
      title={t("home.recent")}
      subtitle={t("home.recentSub")}
      seeMoreTo={SEE_ALL_PATH}
      seeMoreLabel={t("home.seeMore")}
      prevLabel={t("home.recentPrev")}
      nextLabel={t("home.recentNext")}
      busy={isPending}
    >
      {isPending
        ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height="21rem" radius="var(--radius-card)" />)
        : [
            ...items.map((business) => <StoreTileCard key={business.id} business={business} />),
            <Link key="more" to={SEE_ALL_PATH} className={styles.more}>
              <span className={styles.moreIcon}>
                <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
              </span>
              <span className={styles.moreTitle}>{t("home.seeMore")}</span>
              <span className={styles.moreMeta}>
                {total} {total === 1 ? "business" : "businesses"}
              </span>
            </Link>
          ]}
    </Carousel>
    </HomeSection>
  );
}
