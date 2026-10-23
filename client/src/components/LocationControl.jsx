import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useGeoStore } from "../stores/geo.js";
import { showToast } from "../stores/toast.js";
import styles from "./LocationControl.module.css";

export function describeLocation({ status, source, town }) {
  if (status === "asking") return "Finding your location…";
  if (status === "granted" && source === "town") return `Near ${town}`;
  if (status === "granted") return "Your approximate location";
  if (status === "denied" || status === "unsupported") return "Location is turned off";
  return "Not set";
}

// Lives in the site menu, which every page can open, so the shopper can always see what we are using
// and change or clear it without hunting for the page that first asked.
export default function LocationControl({ className = "" }) {
  const status = useGeoStore((s) => s.status);
  const source = useGeoStore((s) => s.source);
  const town = useGeoStore((s) => s.town);
  const request = useGeoStore((s) => s.request);
  const reset = useGeoStore((s) => s.reset);
  const active = status === "granted";

  const clear = () => {
    reset();
    showToast("Location cleared. We are not using it.");
  };

  return (
    <section aria-labelledby="menu-location" className={`${styles.root} ${className}`}>
      <h2 id="menu-location" className={styles.label}>
        Your location
      </h2>
      <p className={styles.current}>
        <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />
        <span>{describeLocation({ status, source, town })}</span>
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={request} disabled={status === "asking"}>
          {active ? "Change" : "Set location"}
        </button>
        {active && (
          <button type="button" className={styles.action} onClick={clear}>
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            <span>Clear</span>
          </button>
        )}
      </div>
    </section>
  );
}
