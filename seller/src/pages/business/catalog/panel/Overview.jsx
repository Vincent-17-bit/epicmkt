import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ItemView } from "@epicmkt/ui";
import { formFromItem } from "@epicmkt/shared";
import ui from "../../../../styles/ui.module.css";
import { readDevicePref, storeDevicePref } from "../cardItem.js";
import QualityPanel from "../editor/Quality.jsx";
import { ScaledFrame } from "../editor/LivePreview.jsx";
import { qualityChecks } from "../editor/model.js";
import { liveLinkOf, publicItemOf } from "./publicItem.js";
import styles from "./panel.module.css";

const DEVICES = [["phone", "Phone"], ["desktop", "Desktop"]];
const WIDTH = { phone: 375, desktop: 1040 };
const KEY = "seller.panel.previewDevice";

export default function Overview({ item, shop, reason, ctx }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [device, setDevice] = useState(() => readDevicePref(KEY, "phone", DEVICES.map((d) => d[0])));
  const [copied, setCopied] = useState("");
  const pub = useMemo(() => publicItemOf(item), [item]);
  const checks = useMemo(() => qualityChecks(formFromItem(item), item.imageCount ?? 0), [item]);
  const url = liveLinkOf(shop.slug, item.id);
  const blocked = !reason.showing ? "Customers cannot see this item yet." : !url ? "The customer site address is not set up for this app." : "";
  const pick = (id) => { setDevice(id); storeDevicePref(KEY, id); };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Link copied.");
    } catch {
      setCopied("Could not copy. Select the link and copy it.");
    }
  };
  const fix = reason.fix;
  const runFix = () => (fix.kind === "show" ? ctx.handlers.toggle(item) : ctx.handlers.restock(item));
  const jump = (step, focus) => navigate(`/business/catalog/${item.id}/edit`, { state: { from: location.search, step, focus } });
  return (
    <div className={styles.stack}>
      <section className={`${styles.card} ${reason.showing ? "" : styles.cardWarn}`} aria-labelledby="panel-visibility" data-testid="visibility-card" data-code={reason.code}>
        <h3 id="panel-visibility" className={styles.h3}>{reason.showing ? "Showing to customers" : "Not showing to customers"}</h3>
        <p className={styles.sentence}>{reason.text}</p>
        {fix && fix.kind === "link" && <Link className={`${ui.btn} ${styles.fit}`} to={fix.to}>{fix.label}</Link>}
        {fix && fix.kind !== "link" && (
          <button type="button" className={`${ui.btn} ${styles.fit}`} onClick={runFix} disabled={ctx.readOnly || ctx.busy}>{fix.label}</button>
        )}
      </section>

      <section className={styles.stack} aria-labelledby="panel-links">
        <h3 id="panel-links" className={styles.h3}>Customer page</h3>
        <div className={styles.buttons}>
          {blocked ? (
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled>Open live page</button>
          ) : (
            <a className={`${ui.btn} ${ui.btnGhost}`} href={url} target="_blank" rel="noreferrer">Open live page<span className={styles.sr}> (opens in a new tab)</span></a>
          )}
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={copy} disabled={Boolean(blocked)}>Copy link</button>
        </div>
        {blocked && <p className={ui.muted} data-testid="link-reason">{blocked}</p>}
        {copied && <p className={ui.muted} role="status">{copied}</p>}
      </section>

      <section className={styles.stack} aria-labelledby="panel-preview">
        <div className={styles.rowBetween}>
          <h3 id="panel-preview" className={styles.h3}>How customers see it</h3>
          <div className={styles.segment} role="group" aria-label="Device">
            {DEVICES.map(([id, label]) => <button key={id} type="button" aria-pressed={device === id} onClick={() => pick(id)}>{label}</button>)}
          </div>
        </div>
        <div className={styles.preview} data-testid="item-preview" data-device={device}>
          <ScaledFrame width={WIDTH[device]}>
            <div className={styles.previewSurface}>
              <ItemView item={pub} shown={pub.pricing} layout={device === "desktop" ? "page" : "sheet"} headingId="preview-title" Heading="h4" />
            </div>
          </ScaledFrame>
        </div>
        <p className={styles.axisNote}>Same page customers get, without buttons. Flash sales, offers and similar items are not drawn here.</p>
      </section>

      <section aria-labelledby="panel-quality">
        <QualityPanel checks={checks} onJump={jump} headingLevel="h3" />
      </section>
    </div>
  );
}
