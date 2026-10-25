import { useFeaturedShowcase } from "../hooks/useFeaturedShowcase.js";
import { t } from "../i18n/index.js";
import Button from "./Button.jsx";
import Carousel from "./Carousel.jsx";
import HomeSection from "./HomeSection.jsx";
import Skeleton from "./Skeleton.jsx";
import StoreShowcaseCard from "./StoreShowcaseCard.jsx";
import styles from "./FeaturedStores.module.css";

export const FEATURED_PATH = "/featured";

/** Home page: featured stores as department-style cards in a scrolling row, with See more going to /featured. */
export default function FeaturedStores() {
  const { cards, isPending, isError, productsPending, refetch } = useFeaturedShowcase();

  if (!isPending && !isError && cards.length === 0) return null;

  if (isError) {
    return (
      <HomeSection>
        <div className={styles.error} role="alert">
          <p>{t("home.featuredFailed")}</p>
          <Button onClick={() => refetch()}>{t("home.retry")}</Button>
        </div>
      </HomeSection>
    );
  }

  return (
    <HomeSection labelledBy="featured-title">
    <Carousel
      id="featured"
      variant="showcase"
      title={t("home.featured")}
      subtitle={t("home.featuredSub")}
      seeMoreTo={FEATURED_PATH}
      seeMoreLabel={t("home.seeMore")}
      prevLabel={t("home.featuredPrev")}
      nextLabel={t("home.featuredNext")}
      busy={isPending}
    >
      {isPending
        ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height="30rem" radius="var(--radius-card)" />)
        : cards.map(({ store, products }) => (
            <StoreShowcaseCard key={store.id} business={store} products={products} loading={productsPending} />
          ))}
    </Carousel>
    </HomeSection>
  );
}
