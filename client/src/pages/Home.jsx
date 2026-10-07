import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faArrowDown, faRotateRight, faMagnifyingGlass, faStore } from "@fortawesome/free-solid-svg-icons";
import { getCategories, getFeaturedBusinesses } from "../api/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";
import { rotationSeed } from "../lib/rotation.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { Button, Skeleton, Container } from "@epicmkt/ui";
import CardGrid from "../components/CardGrid.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import FlashStrip from "../components/FlashStrip.jsx";
import PageBanner from "../components/PageBanner.jsx";
import BrowseResults from "../components/BrowseResults.jsx";
import BusinessRail from "../components/BusinessRail.jsx";
import HomeList from "../components/HomeList.jsx";
import NearYou from "../components/NearYou.jsx";
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


function Featured() {
  const { data, isPending } = useQuery({
    queryKey: ["featured", rotationSeed()],
    queryFn: () => getFeaturedBusinesses({ limit: 8, seed: rotationSeed() }),
    staleTime: 60_000
  });

  if (!isPending && !data?.length) return null;

  return (
    <section className={styles.section} aria-labelledby="featured-title">
      <Container>
        <h2 id="featured-title" className={styles.heading}>
          Featured businesses
        </h2>
        {isPending ? (
          <Skeleton height="15rem" radius="var(--radius-card)" />
        ) : (
          <BusinessRail items={data} label="Featured businesses" />
        )}
      </Container>
    </section>
  );
}

export default function Home() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const openSearch = () =>
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { state: { menu: true, search: true } }
    );
  const query = (params.get("q") ?? "").trim();
  const isSearch = location.pathname === "/search";
  const { data, isPending, isError, isSuccess, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 5 * 60_000
  });

  const category = slug ? data?.find((c) => c.id === slug) : null;
  const missing = Boolean(slug) && isSuccess && !category;

  usePageTitle(missing ? "Page not found" : category ? category.name : query ? `Search: ${query}` : isSearch ? "All businesses" : undefined);

  if (missing) return <NotFound />;

  if (slug) {
    return (
      <>
        <PageBanner
          crumbs={<PageBreadcrumbs />}
          loading={isPending}
          icon={category ? categoryIcon(category.icon) : undefined}
          title={category?.name}
          subtitle={category?.blurb}
        />
        <section className={styles.section}>
          <Container>
            <FlashStrip id="category-flash-title" categoryId={slug} />
            <BrowseResults categoryId={slug} />
          </Container>
        </section>
      </>
    );
  }

  if (isSearch || query) {
    return (
      <>
        <PageBanner
          crumbs={<PageBreadcrumbs />}
          icon={faMagnifyingGlass}
          title={query ? `Results for "${query}"` : "All businesses"}
          subtitle={query ? undefined : "Browse everything listed on EpicMKT, or use the search to narrow it down."}
        />
        <section className={styles.section}>
          <Container>
            <BrowseResults query={query} />
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
          <button type="button" className={styles.searchEntry} onClick={openSearch}>
            <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} />
            <span className={styles.searchText}>Search barbers, chemists, gyms…</span>
            <span className={styles.searchGo}>Search</span>
          </button>
          <Button as={Link} to="/#categories" variant="dark" size="lg" iconRight={faArrowDown}>
            Browse categories
          </Button>
        </Container>
      </section>

      <Container>
        <FlashStrip id="home-flash-title" />
      </Container>

      <section className={styles.section} aria-labelledby="near-title">
        <Container>
          <h2 id="near-title" className={styles.heading}>
            Near you
          </h2>
          <NearYou />
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

      <Featured />

      <section className={styles.section} aria-labelledby="top-title">
        <Container>
          <h2 id="top-title" className={styles.heading}>
            Top rated
          </h2>
          <HomeList sort="rating" />
        </Container>
      </section>

      <section className={styles.section} aria-labelledby="recent-title">
        <Container>
          <h2 id="recent-title" className={styles.heading}>
            Recently added
          </h2>
          <HomeList sort="newest" />
        </Container>
      </section>

      <section className={styles.section} aria-labelledby="cta-title">
        <Container>
          <div className={styles.cta}>
            <span className={styles.ctaIcon}>
              <FontAwesomeIcon icon={faStore} />
            </span>
            <div className={styles.ctaText}>
              <h2 id="cta-title" className={styles.ctaTitle}>
                List your business
              </h2>
              <p>Get found by customers nearby. Standard from KSh 500 a month, Premium from KSh 1,500.</p>
            </div>
            <Button as={Link} to="/sell" variant="dark" size="lg" iconRight={faArrowRight}>
              Become a seller
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
