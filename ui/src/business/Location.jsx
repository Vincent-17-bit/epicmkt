import { faMap } from "@fortawesome/free-solid-svg-icons";
import { actionProps, isPreview } from "../preview.js";
import Button from "../components/Button.jsx";
import BusinessSection from "./BusinessSection.jsx";
import { mapSrc } from "./groupServices.js";
import styles from "./Location.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

export default function Location({ name, lat, lng, directionsHref, mode = "live", onDirections }) {
  const preview = isPreview(mode);
  const act = actionProps(preview);

  return (
    <BusinessSection title="Location" id="location">
      <div className={styles.map}>
        <iframe
          title={`Map showing ${name}`}
          src={mapSrc(lat, lng)}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={styles.mapFrame}
          {...(preview ? { inert: "" } : {})}
        />
      </div>
      <div className={styles.mapActions}>
        <Button as="a" variant="secondary" icon={faMap} {...act.link(directionsHref, onDirections, external)}>
          View on map
        </Button>
      </div>
    </BusinessSection>
  );
}
