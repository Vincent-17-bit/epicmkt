import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWifi } from "@fortawesome/free-solid-svg-icons";
import { useOnlineStatus } from "../hooks/useOnlineStatus.js";
import styles from "./OfflineBanner.module.css";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="status" className={styles.banner}>
      <FontAwesomeIcon icon={faWifi} />
      You are offline. Saved pages still work.
    </div>
  );
}
