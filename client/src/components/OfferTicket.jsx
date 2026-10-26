import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCopy, faImage } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import {
  conditionsText,
  formatKes,
  offerClaimMessage,
  offerHeadline,
  offerLabel,
  offerSavings,
  offerSteps,
  whatsappLink
} from "@epicmkt/shared";
import { offerExpiry } from "../lib/itemView.js";
import { t } from "../i18n/index.js";
import styles from "./OfferTicket.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

function CopyCode({ code }) {
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
      // The code stays on screen to read out.
    }
  };
  return (
    <button type="button" className={styles.code} onClick={copy} aria-label={`${t("offer.copy")} ${code}`}>
      <span className={styles.codeLabel}>{t("offer.code")}</span>
      <strong className={styles.codeValue}>{code}</strong>
      <FontAwesomeIcon icon={done ? faCheck : faCopy} aria-hidden="true" />
      <span className={styles.sr} role="status">{done ? t("offer.copied") : ""}</span>
    </button>
  );
}

/**
 * One offer on the product page. It explains the deal in the customer's terms: what it is, what it is worth on this
 * product's real price, how to get it, what else is in it, and one tap to claim it with the seller.
 * `item` is the product being viewed; `price` is what it costs now (a flash price counts).
 */
export default function OfferTicket({ view, item, price, onOpenProduct }) {
  const { offer, remainingMs, products = [], availableNow = true } = view;
  const others = products.filter((p) => p.id !== item.id);
  const savings = offerSavings(offer, { price, companions: others });
  const steps = offerSteps(offer, { products });
  const conditions = conditionsText(offer);
  const ends = offerExpiry(remainingMs);
  const urgent = remainingMs != null && remainingMs < 24 * 3600000;
  const whatsapp = item.business?.whatsapp;
  const claim = whatsapp ? whatsappLink(whatsapp, offerClaimMessage(offer, item.name)) : null;
  const together = offer.kind === "bundle";

  return (
    <article className={styles.ticket} data-kind={offer.kind}>
      <div className={styles.stub} aria-hidden="true">
        <span className={styles.stubText}>{offerLabel(offer)}</span>
      </div>
      <div className={styles.body}>
        <h4 className={styles.title}>{offer.title || offerHeadline(offer)}</h4>
        <p className={styles.headline}>
          <span className={styles.sr}>{offerLabel(offer)}. </span>
          {offerHeadline(offer)}
        </p>
        {offer.description && <p className={styles.description}>{offer.description}</p>}

        {savings && (
          <p className={styles.savings}>
            <span>{savings.text}</span>
            <strong className={styles.save}>
              {t("offer.youSave")} {formatKes(savings.save)}
            </strong>
          </p>
        )}

        {steps.length > 0 && (
          <details className={styles.how}>
            <summary className={styles.howSummary}>{t("offer.how")}</summary>
            <ol className={styles.steps}>
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        )}

        {(conditions.length > 0 || !availableNow) && (
          <ul className={styles.conditions}>
            {conditions.map((text) => (
              <li key={text} className={styles.condition}>
                {text}
              </li>
            ))}
            {!availableNow && <li className={`${styles.condition} ${styles.pause}`}>{t("offer.onlyNow")}</li>}
          </ul>
        )}

        {others.length > 0 && (
          <div className={styles.others}>
            <p className={styles.othersLabel}>{together ? t("offer.together") : t("offer.inOffer")}</p>
            <ul className={styles.products}>
              {others.slice(0, 4).map((product) => (
                <li key={product.id}>
                  <button type="button" className={styles.product} onClick={() => onOpenProduct?.(product.id)} aria-label={`${t("offer.openProduct")} ${product.name}`}>
                    <span className={styles.thumb}>
                      {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" decoding="async" className={styles.thumbImg} /> : <FontAwesomeIcon icon={faImage} aria-hidden="true" />}
                    </span>
                    <span className={styles.productName}>{product.name}</span>
                    {Number.isFinite(product.price) && <span className={styles.productPrice}>{formatKes(product.price)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.foot}>
          {offer.code && <CopyCode code={offer.code} />}
          <span className={`${styles.ends} ${urgent ? styles.urgent : ""}`}>{ends ? `${t("offer.endsIn")} ${ends}` : t("item.noLimit")}</span>
        </div>
        {offer.terms && <p className={styles.terms}>{offer.terms}</p>}

        {claim && (
          <a href={claim} {...external} className={styles.claim}>
            <FontAwesomeIcon icon={faWhatsapp} aria-hidden="true" />
            <span>{t("offer.claim")}</span>
          </a>
        )}
      </div>
    </article>
  );
}
