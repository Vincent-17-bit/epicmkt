import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faArrowDown, faRotateRight, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { getCategories } from "../api/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import Container from "../components/Container.jsx";
import Button from "../components/Button.jsx";
import Skeleton from "../components/Skeleton.jsx";
import CardGrid from "../components/CardGrid.jsx";
import PageBanner from "../components/PageBanner.jsx";
import BusinessResults from "../components/BusinessResults.jsx";
import NotFound from "./NotFound.jsx";
import styles from "./Home.module.css";

function CategorySkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <Skeleton width="48px" height="48px" radius="999px" />
      <Skeleton width="60%" height="1.1rem" />
      <Skeleton width="85%" height="0.9rem" />
    </div>
  );
}

export default function Home() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const query = (params.get("q") ?? "").trim();
  const { data, isPending, isError, isSuccess, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 5 * 60_000
  });

  const category = slug ? data?.find((c) => c.id === slug) : null;
  const missing = Boolean(slug) && isSuccess && !category;

  usePageTitle(missing ? "Page not found" : category ? category.name : query ? `Search: ${query}` : undefined);

  if (missing) return <NotFound />;

  if (slug) {
    return (
      <>
        <PageBanner
          loading={isPending}
          icon={category ? categoryIcon(category.icon) : undefined}
          title={category?.name}
          subtitle={category?.blurb}
        />
        <section className={styles.section}>
          <Container>
            <BusinessResults categoryId={slug} />
          </Container>
        </section>
      </>
    );
  }

  if (query) {
    return (
      <>
        <PageBanner icon={faMagnifyingGlass} title={`Results for "${query}"`} />
        <section className={styles.section}>
          <Container>
            <BusinessResults query={query} />
          </Container>
        </section>
      </>
    );
  }

  return (
    <>
      <section className={styles.hero}>
        <Container className={styles.heroInner}>
          <h1 className={styles.title}>Find trusted local businesses near you</h1>
          <p className={styles.lead}>
            Barbershops, water refill points, chemists, agrovets, gyms and more. Call, WhatsApp or get directions in one tap.
          </p>
          <Button as={Link} to="/#categories" variant="dark" size="lg" iconRight={faArrowDown}>
            Browse categories
          </Button>
        </Container>
      </section>

      <section id="categories" className={styles.section} aria-labelledby="categories-title">
        <Container>
          <h2 id="categories-title" className={styles.heading}>
            Browse by category
          </h2>

          {isError ? (
            <div className={styles.error} role="alert">
              <p>We could not load the categories.</p>
              <Button icon={faRotateRight} onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <CardGrid aria-busy={isPending}>
              {isPending
                ? Array.from({ length: 10 }, (_, i) => (
                    <li key={i}>
                      <CategorySkeleton />
                    </li>
                  ))
                : data.map((item) => (
                    <li key={item.id}>
                      <Link to={`/c/${item.id}`} className={styles.card}>
                        <span className={styles.icon}>
                          <FontAwesomeIcon icon={categoryIcon(item.icon)} />
                        </span>
                        <span className={styles.name}>{item.name}</span>
                        <span className={styles.blurb}>{item.blurb}</span>
                        <span className={styles.meta}>
                          {item.count} {item.count === 1 ? "listing" : "listings"}
                          <FontAwesomeIcon icon={faArrowRight} className={styles.arrow} />
                        </span>
                      </Link>
                    </li>
                  ))}
            </CardGrid>
          )}
        </Container>
      </section>
    </>
  );
}
