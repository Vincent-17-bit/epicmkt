import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationCrosshairs, faLocationDot, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { getNearbyBusinesses } from "../api/index.js";
import { useGeoStore } from "../stores/geo.js";
import Button from "./Button.jsx";
import BusinessCard from "./BusinessCard.jsx";
import CardGrid from "./CardGrid.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./NearYou.module.css";

const RADIUS_KM = 25;

function Prompt({ status, onAsk }) {
  const denied = status === "denied" || status === "unsupported";
  return (
    <div className={styles.prompt}>
      <span className={styles.icon}>
        <FontAwesomeIcon icon={faLocationDot} />
      </span>
      <div className={styles.text}>
        <p className={styles.lead}>{denied ? "Location is off" : "See what is closest to you"}</p>
      </div>
      <Button
        icon={denied ? faLocationDot : faLocationCrosshairs}
        disabled={status === "asking"}
        onClick={onAsk}
      >
        {status === "asking" ? "Locating…" : denied ? "Choose a town" : "Set location"}
      </Button>
    </div>
  );
}

export default function NearYou() {
  const status = useGeoStore((s) => s.status);
  const coords = useGeoStore((s) => s.coords);
  const request = useGeoStore((s) => s.request);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["nearby", coords],
    queryFn: () => getNearbyBusinesses({ ...coords, radiusKm: RADIUS_KM, limit: 4 }),
    enabled: status === "granted" && Boolean(coords)
  });

  if (status !== "granted") return <Prompt status={status} onAsk={request} />;

  if (isError) {
    return (
      <div className={styles.prompt} role="alert">
        <div className={styles.text}>
          <p className={styles.lead}>We could not load nearby businesses.</p>
        </div>
        <Button icon={faRotateRight} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <CardGrid aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i}>
            <Skeleton height="15rem" radius="var(--radius-card)" />
          </li>
        ))}
      </CardGrid>
    );
  }

  if (!data.length) {
    return (
      <div className={styles.prompt}>
        <div className={styles.text}>
          <p className={styles.lead}>Nothing listed within {RADIUS_KM} km yet</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <CardGrid>
        {data.map((business) => (
          <li key={business.id}>
            <BusinessCard business={business} />
          </li>
        ))}
      </CardGrid>
    </>
  );
}
