import { Link } from "react-router-dom";
import { showingSummary, summaryText } from "@epicmkt/shared";
import { STATE_LABELS } from "../lib/listing.js";
import styles from "./listings.module.css";

export default function Summary({ items, shopLive, state }) {
  const summary = showingSummary(items, { shopLive });
  return (
    <div className={styles.summary}>
      <p data-testid="showing-summary">{summaryText(summary)}</p>
      {!shopLive && (
        <p className={styles.notLive} role="note">
          Your shop is {STATE_LABELS[state]?.toLowerCase() ?? "not live"}, so no item is showing to customers. Items show again as soon as your shop is live.{" "}
          {state === "expired" && <Link to="/subscription">Renew</Link>}
        </p>
      )}
    </div>
  );
}
