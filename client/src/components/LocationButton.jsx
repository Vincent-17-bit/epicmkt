import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { useGeoStore } from "../stores/geo.js";
import styles from "./LocationButton.module.css";

// The short name shown in the header. Never coordinates.
export function locationLabel({ status, source, town }) {
  if (status === "asking") return "Locating…";
  if (status === "granted") return source === "town" && town ? town : "Near you";
  return "Set location";
}

// Always in the header, so the location can be seen, changed or reset from any page in one tap.
export default function LocationButton() {
  const status = useGeoStore((s) => s.status);
  const source = useGeoStore((s) => s.source);
  const town = useGeoStore((s) => s.town);
  const request = useGeoStore((s) => s.request);
  const label = locationLabel({ status, source, town });
  const set = status === "granted";

  return (
    <button
      type="button"
      className={styles.btn}
      data-set={set}
      aria-label={set ? `Location: ${label}. Change` : label}
      onClick={request}
    >
      <FontAwesomeIcon icon={faLocationDot} className={styles.icon} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </button>
  );
}
