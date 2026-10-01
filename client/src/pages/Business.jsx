import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPhone, faLocationArrow, faLocationDot, faClock, faStar, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { directionsLink, telLink, whatsappLink } from "@epicmkt/shared";
import { getBusiness, logContactEvent } from "../api/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import Container from "../components/Container.jsx";
import Button from "../components/Button.jsx";
import PageBanner from "../components/PageBanner.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { FeaturedBadge, VerifiedBadge } from "../components/Badges.jsx";
import NotFound from "./NotFound.jsx";
import styles from "./Business.module.css";

export default function Business() {
  const { slug } = useParams();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["business", slug],
    queryFn: () => getBusiness(slug),
    retry: false
  });

  usePageTitle(data?.name);

  if (isError && error?.name === "NotFoundError") return <NotFound />;

  if (isError) {
    return (
      <Container className={styles.state} role="alert">
        <p>We could not load this business.</p>
        <Button icon={faRotateRight} onClick={() => refetch()}>
          Try again
        </Button>
      </Container>
    );
  }

  if (isPending) {
    return (
      <>
        <PageBanner loading />
        <Container className={styles.page} aria-busy="true">
          <Skeleton height="1rem" width="80%" />
          <Skeleton height="1rem" width="60%" />
          <Skeleton height="44px" radius="var(--radius-pill)" />
        </Container>
      </>
    );
  }

  const track = (type) => () => logContactEvent({ businessId: data.id, type });
  const hours = data.todayHours ? `Today ${data.todayHours[0]} to ${data.todayHours[1]}` : "Closed today";

  return (
    <>
      <PageBanner icon={categoryIcon(data.category?.icon)} title={data.name} subtitle={data.tagline} />
      <Container className={styles.page}>
        <div className={styles.badges}>
          {data.plan === "premium" && <FeaturedBadge />}
          {data.verified && <VerifiedBadge />}
          <span className={data.isOpen ? styles.open : styles.closed}>{data.isOpen ? "Open now" : "Closed"}</span>
        </div>

        <p className={styles.description}>{data.description}</p>

        <ul className={styles.facts}>
          <li>
            <FontAwesomeIcon icon={faLocationDot} />
            {data.address}, {data.area}, {data.county}
          </li>
          <li>
            <FontAwesomeIcon icon={faClock} />
            {hours}
          </li>
          <li>
            <FontAwesomeIcon icon={faStar} />
            {data.reviewCount > 0 ? `${data.rating.toFixed(1)} (${data.reviewCount})` : "New"}
          </li>
        </ul>

        {data.tags?.length > 0 && (
          <ul className={styles.tags} aria-label="Services">
            {data.tags.map((tag) => (
              <li key={tag} className={styles.tag}>
                {tag}
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          <Button as="a" href={telLink(data.phone)} icon={faPhone} onClick={track("call")}>
            Call
          </Button>
          <Button
            as="a"
            variant="secondary"
            href={whatsappLink(data.whatsapp, `Hi ${data.name}, I found you on EpicMKT.`)}
            target="_blank"
            rel="noopener noreferrer"
            icon={faWhatsapp}
            onClick={track("whatsapp")}
          >
            WhatsApp
          </Button>
          <Button
            as="a"
            variant="secondary"
            href={directionsLink(data.lat, data.lng)}
            target="_blank"
            rel="noopener noreferrer"
            icon={faLocationArrow}
            onClick={track("directions")}
          >
            Directions
          </Button>
        </div>
      </Container>
    </>
  );
}
