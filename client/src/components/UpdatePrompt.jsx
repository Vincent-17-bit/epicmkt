import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import Button from "./Button.jsx";
import styles from "./UpdatePrompt.module.css";

export default function UpdatePrompt() {
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      clearInterval(timer.current);
      timer.current = setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    }
  });

  if (!needRefresh) return null;

  return (
    <div role="alert" className={styles.prompt}>
      <p className={styles.text}>
        <FontAwesomeIcon icon={faArrowsRotate} />
        A new version of EpicMKT is ready.
      </p>
      <div className={styles.actions}>
        <Button size="sm" onClick={() => updateServiceWorker(true)}>
          Reload
        </Button>
        <Button size="sm" variant="dark" className={styles.later} onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
      </div>
    </div>
  );
}
