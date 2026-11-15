import { faMap } from "@fortawesome/free-solid-svg-icons";
import { actionProps, isPreview } from "../preview.js";
import Button from "../components/Button.jsx";
import BusinessSection from "./BusinessSection.jsx";
import ShopMap from "./ShopMap.jsx";
import styles from "./Location.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

export default function Location({ name, lat, lng, directionsHref, mode = "live", onDirections }) {
  const preview = isPreview(mode);
  const act = actionProps(preview);

  return (
    <BusinessSection title="Location" id="location">
      {preview ? (
        <div {...{ inert: "" }}>
          <ShopMap name={name} lat={lat} lng={lng} className={styles.mapBox} />
        </div>
      ) : (
        <ShopMap name={name} lat={lat} lng={lng} className={styles.mapBox} />
      )}
      <div className={styles.mapActions}>
        <Button as="a" variant="secondary" icon={faMap} {...act.link(directionsHref, onDirections, external)}>
          View on map
        </Button>
      </div>
    </BusinessSection>
  );
}
