import { faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { actionProps, isPreview } from "../preview.js";
import Button from "../components/Button.jsx";
import BusinessSection from "./BusinessSection.jsx";
import styles from "./ShareQr.module.css";

export default function ShareQr({ qr, shortUrl, shareNote, mode = "live", onShare }) {
  const act = actionProps(isPreview(mode));

  return (
    <BusinessSection title="Share this page" id="qr">
      <div className={styles.qrRow}>
        {qr}
        <div className={styles.qrText}>
          <p>Scan to open this page on another phone.</p>
          <p className={styles.qrLink}>{shortUrl.replace(/^https?:\/\//, "")}</p>
          <Button variant="secondary" size="sm" icon={faShareNodes} {...act.button(onShare)}>
            {shareNote || "Share"}
          </Button>
        </div>
      </div>
    </BusinessSection>
  );
}
