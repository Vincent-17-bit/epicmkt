import { Card } from "../../components/index.js";
import s from "./command.module.css";

/**
 * Placeholder for the Expiry Radar preview. Step B1e fills this in; the page already gives it the live counts and
 * the next-expiry time so it needs no new data plumbing: <ExpiryRadarPreview counts={...} nextExpiry={ISO|null} loading />.
 */
// eslint-disable-next-line no-unused-vars
export default function ExpiryRadarPreview({ counts, nextExpiry, loading }) {
  return (
    <Card as="section" title="Expiry radar" headingLevel={2} className={s.span5} data-slot="expiry-radar">
      <div className={s.slot}><p className={s.panelNote}>The expiry radar preview is added in step B1e.</p></div>
    </Card>
  );
}
