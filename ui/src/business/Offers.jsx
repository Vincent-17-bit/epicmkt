import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCopy, faImage, faPlus } from "@fortawesome/free-solid-svg-icons";
import { formatKes } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import LazyImage from "../components/LazyImage.jsx";
import BusinessSection from "./BusinessSection.jsx";
import styles from "./Offers.module.css";

const DEFAULT_LABELS = {
  title: "Offers",
  code: "Code",
  copy: "Copy code",
  copied: "Copied",
  endsIn: "Ends in",
  noEnd: "No end date",
  onlyNow: "Not running at this hour",
  openProduct: "Open",
  wholeShop: "Whole shop"
};

export function expiryText(ms, endsIn = DEFAULT_LABELS.endsIn) {
  if (ms == null) return null;
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes >= 2880) return `${endsIn} ${Math.floor(minutes / 1440)} days`;
  if (minutes >= 1440) return `${endsIn} 1 day`;
  if (minutes >= 120) return `${endsIn} ${Math.floor(minutes / 60)} hours`;
  if (minutes >= 60) return `${endsIn} 1 hour`;
  return `${endsIn} ${minutes} min`;
}

const MAX_SHOWN = 4;

function CopyCode({ code, labels, disabled }) {
  const [done, setDone] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setDone(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1800);
    } catch {
      // The code is on screen: if the clipboard is not available the customer can still read it out.
    }
  };
  return (
    <button type="button" className={styles.code} onClick={copy} disabled={disabled} aria-label={`${labels.copy} ${code}`}>
      <span className={styles.codeLabel}>{labels.code}</span>
      <strong className={styles.codeValue}>{code}</strong>
      <FontAwesomeIcon icon={done ? faCheck : faCopy} aria-hidden="true" />
      <span className={styles.live} role="status">{done ? labels.copied : ""}</span>
    </button>
  );
}

function Deal({ deal, labels, mode, onOpenItem }) {
  const preview = isPreview(mode);
  const act = actionProps(preview);
  const shown = deal.products.slice(0, MAX_SHOWN);
  const hidden = deal.products.length - shown.length;
  const ends = expiryText(deal.remainingMs, labels.endsIn);
  const urgent = deal.remainingMs != null && deal.remainingMs < 24 * 3600000;

  return (
    <li className={styles.deal} data-kind={deal.kind}>
      <div className={styles.stub} aria-hidden="true">
        <span className={styles.stubText}>{deal.label}</span>
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{deal.title}</h3>
        <p className={styles.headline}>
          <span className={styles.sr}>{deal.label}. </span>
          {deal.headline}
        </p>
        {deal.description && <p className={styles.description}>{deal.description}</p>}

        {shown.length > 0 && (
          <ul className={styles.products} aria-label={deal.title}>
            {shown.map((product, index) => (
              <li key={product.id} className={styles.productItem}>
                {index > 0 && deal.kind === "bundle" && <FontAwesomeIcon icon={faPlus} className={styles.plus} aria-hidden="true" />}
                <button type="button" className={styles.product} {...act.button(() => onOpenItem?.(product.id))} aria-haspopup="dialog" aria-label={`${labels.openProduct} ${product.name}`}>
                  <span className={styles.thumb}>
                    {product.imageUrl ? <LazyImage src={product.imageUrl} className={styles.thumbImg} width={96} alt="" /> : <FontAwesomeIcon icon={faImage} aria-hidden="true" />}
                  </span>
                  <span className={styles.productText}>
                    <span className={styles.productName}>{product.name}</span>
                    {Number.isFinite(product.price) && <span className={styles.productPrice}>{formatKes(product.price)}</span>}
                  </span>
                </button>
              </li>
            ))}
            {hidden > 0 && <li className={styles.moreProducts}>+{hidden}</li>}
          </ul>
        )}

        {(deal.scope === "store" || deal.conditions.length > 0 || !deal.availableNow) && (
          <ul className={styles.conditions} aria-label="Conditions">
            {deal.scope === "store" && <li className={styles.condition}>{labels.wholeShop}</li>}
            {deal.conditions.map((text) => (
              <li key={text} className={styles.condition}>{text}</li>
            ))}
            {!deal.availableNow && <li className={`${styles.condition} ${styles.pause}`}>{labels.onlyNow}</li>}
          </ul>
        )}

        <div className={styles.foot}>
          {deal.code && <CopyCode code={deal.code} labels={labels} disabled={preview} />}
          {ends && <span className={`${styles.ends} ${urgent ? styles.urgent : ""}`}>{ends}</span>}
        </div>
        {deal.terms && <p className={styles.terms}>{deal.terms}</p>}
      </div>
    </li>
  );
}

/**
 * The store page's offers. Each deal is a ticket naming the offer and the products it is on (a shop offer is on the whole shop and lists none); tapping a product opens it.
 * `offers` are deals: { id, kind, title, label, headline, description, code, terms, remainingMs, conditions[], availableNow, products[] }.
 */
export default function Offers({ offers, mode = "live", onOpenItem, labels: given }) {
  const labels = { ...DEFAULT_LABELS, ...given };
  return (
    <BusinessSection title={labels.title} id="offers">
      <ul className={styles.deals}>
        {offers.map((deal) => (
          <Deal key={deal.id} deal={deal} labels={labels} mode={mode} onOpenItem={onOpenItem} />
        ))}
      </ul>
    </BusinessSection>
  );
}
