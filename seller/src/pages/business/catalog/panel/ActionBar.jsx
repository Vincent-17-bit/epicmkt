import { useState } from "react";
import ShopQr from "../../../../components/ShopQr.jsx";
import ui from "../../../../styles/ui.module.css";
import Modal from "../Modal.jsx";
import { liveLinkOf } from "./publicItem.js";
import styles from "./panel.module.css";

export default function ActionBar({ item, shop, ctx, reason, logo }) {
  const [share, setShare] = useState(false);
  const [copied, setCopied] = useState("");
  const locked = item.removed || ctx.readOnly || ctx.busy;
  const adminHidden = item.visibility === "hidden_admin";
  const hides = item.visible && !item.draft;
  const url = liveLinkOf(shop.slug, item.id);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Link copied.");
    } catch {
      setCopied("Could not copy. Select the link and copy it.");
    }
  };
  return (
    <>
      {ctx.readOnly && <p className={`${ui.error} ${styles.barNote}`} role="status" data-testid="read-only">{ctx.readOnlyText}</p>}
      <div className={styles.bar} role="group" aria-label="Item actions">
        <button type="button" className={`${ui.btn} ${styles.act}`} onClick={() => ctx.handlers.edit(item)} disabled={locked}>Edit</button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost} ${styles.act}`} onClick={() => ctx.handlers.duplicate(item)} disabled={locked}>Duplicate</button>
        {(item.soldOut || item.trackStock) && (
          <button type="button" className={`${ui.btn} ${ui.btnGhost} ${styles.act}`} onClick={() => ctx.handlers.restock(item)} disabled={locked}>Restock</button>
        )}
        <button
          type="button"
          className={`${ui.btn} ${ui.btnGhost} ${styles.act}`}
          onClick={() => ctx.handlers.toggle(item)}
          disabled={adminHidden || ctx.readOnly || ctx.busy}
          title={adminHidden ? "Hidden by admin. You cannot change this." : undefined}
        >
          {hides ? "Hide" : "Show"}
        </button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost} ${styles.act}`} onClick={() => { setCopied(""); setShare(true); }}>Share</button>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnGhost} ${styles.act} ${styles.danger}`}
          onClick={() => { ctx.startDelete([item.id]); ctx.onClose(); }}
          disabled={locked}
        >
          Delete
        </button>
      </div>
      <Modal open={share} onClose={() => setShare(false)} title="Share this item" labelId="share-title">
        <div className={styles.stack}>
          {url && reason.showing ? (
            <>
              <input className={styles.linkField} readOnly value={url} aria-label="Item link" onFocus={(e) => e.target.select()} />
              <button type="button" className={`${ui.btn} ${styles.fit}`} onClick={copy}>Copy link</button>
              {copied && <p className={ui.muted} role="status">{copied}</p>}
            </>
          ) : (
            <p className={ui.muted} data-testid="share-reason">{reason.showing ? "The customer site address is not set up for this app." : "Customers cannot see this item yet, so there is nothing to share."}</p>
          )}
          <ShopQr slug={shop.slug} planKey={shop.planKey} hasLogo={logo} label={`QR code linking to ${shop.slug}`} />
          <p className={ui.muted}>The code opens your whole shop page.</p>
        </div>
      </Modal>
    </>
  );
}
