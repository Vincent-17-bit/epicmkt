import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faArrowDown, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { getCategories } from "../api/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import Container from "../components/Container.jsx";
import Button from "../components/Button.jsx";
import Skeleton from "../components/Skeleton.jsx";
import CardGrid from "../components/CardGrid.jsx";
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
  usePageTitle();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 5 * 60_000
  });

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
                : data.map((category) => (
                    <li key={category.id}>
                      <Link to={`/search?category=${category.id}`} className={styles.card}>
                        <span className={styles.icon}>
                          <FontAwesomeIcon icon={categoryIcon(category.icon)} />
                        </span>
                        <span className={styles.name}>{category.name}</span>
                        <span className={styles.blurb}>{category.blurb}</span>
                        <span className={styles.meta}>
                          {category.count} {category.count === 1 ? "listing" : "listings"}
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
