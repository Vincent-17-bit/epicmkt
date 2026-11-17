import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxesStacked, faClone, faEye, faEyeSlash, faPen, faShareNodes, faTrash } from "@fortawesome/free-solid-svg-icons";
import { copyText } from "../../../../lib/copy.js";
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
    setCopied((await copyText(url)) ? "Link copied." : "Could not copy. Select the link and copy it.");
  };
  return (
    <>
      {ctx.readOnly && <p className={`${ui.error} ${styles.barNote}`} role="status" data-testid="read-only">{ctx.readOnlyText}</p>}
      <div className={styles.bar} role="group" aria-label="Item actions">
        <button type="button" className={`${ui.btn} ${styles.act} ${styles.actMain}`} onClick={() => ctx.handlers.edit(item)} disabled={locked}><FontAwesomeIcon icon={faPen} aria-hidden="true" /><span>Edit</span></button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost} ${styles.act}`} onClick={() => ctx.handlers.duplicate(item)} disabled={locked}><FontAwesomeIcon icon={faClone} aria-hidden="true" /><span className={styles.lbl}>Duplicate</span></button>
        {(item.soldOut || item.trackStock) && (
          <button type="button" className={`${ui.btn} ${ui.btnGhost} ${styles.act}`} onClick={() => ctx.handlers.restock(item)} disabled={locked}><FontAwesomeIcon icon={faBoxesStacked} aria-hidden="true" /><span className={styles.lbl}>Restock</span></button>
        )}
        <button
          type="button"
          className={`${ui.btn} ${ui.btnGhost} ${styles.act}`}
          onClick={() => ctx.handlers.toggle(item)}
          disabled={adminHidden || ctx.readOnly || ctx.busy}
          title={adminHidden ? "Hidden by admin. You cannot change this." : undefined}
        >
          <FontAwesomeIcon icon={hides ? faEyeSlash : faEye} aria-hidden="true" />
          <span className={styles.lbl}>{hides ? "Hide" : "Show"}</span>
        </button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost} ${styles.act}`} onClick={() => { setCopied(""); setShare(true); }}><FontAwesomeIcon icon={faShareNodes} aria-hidden="true" /><span className={styles.lbl}>Share</span></button>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnGhost} ${styles.act} ${styles.danger}`}
          onClick={() => { ctx.startDelete([item.id]); ctx.onClose(); }}
          disabled={locked}
        >
          <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
          <span className={styles.lbl}>Delete</span>
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
