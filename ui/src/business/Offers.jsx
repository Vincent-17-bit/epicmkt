import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, faCircleCheck, faCopy, faTicket, faImage, faPlus } from "@fortawesome/free-solid-svg-icons";
import { formatKes, offerValidity } from "@epicmkt/shared";
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
  wholeShop: "Whole shop",
  claimNow: "Claim now",
  valid: "Valid",
  how: "How to get it",
  youSave: "You save",
  verified: "Verified"
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
const TAGS = 3;

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

/**
 * One offer as a ticket. The same ticket is used on the store page, the product page and the Offers page, so an offer
 * looks the same everywhere and only its details change. Besides the fields listed at `Offers` below, a ticket may carry:
 * `store` { name, logo, verified, distanceText } (the shop, when the ticket is shown away from its own page),
 * `savings` { text, save } (what it is worth on the product being viewed), `steps` [string] (how to get it),
 * `validity` (a ready date line; without it the dates come from startsAt and endsAt),
 * `action` { label, href | (as, to), external, icon, trailingIcon } (one button at the foot), and `headingLevel` ("h2", "h3", ...).
 */
export function OfferDeal({ deal, labels: given, mode = "live", onOpenItem }) {
  const labels = { ...DEFAULT_LABELS, ...given };
  const preview = isPreview(mode);
  const act = actionProps(preview);
  const products = deal.products ?? [];
  const conditions = deal.conditions ?? [];
  const shown = products.slice(0, MAX_SHOWN);
  const hidden = products.length - shown.length;
  const ends = expiryText(deal.remainingMs, labels.endsIn);
  const urgent = deal.remainingMs != null && deal.remainingMs < 24 * 3600000;
  const validity = deal.validity !== undefined ? deal.validity : offerValidity(deal);
  const Heading = deal.headingLevel ?? "h3";
  const { store, savings, steps = [], action } = deal;
  const Action = action?.as ?? "a";
  const actionTarget = action?.as ? { to: action.to } : { href: action?.href, ...(action?.external ? { target: "_blank", rel: "noopener noreferrer" } : {}) };

  return (
    <li className={styles.deal} data-kind={deal.kind}>
      <div className={styles.stub} aria-hidden="true">
        <span className={styles.stubText}>{deal.label}</span>
      </div>
      <div className={styles.body}>
        {store && (
          <p className={styles.store}>
            <span className={styles.storeLogo}>
              {store.logo ? <LazyImage src={store.logo} className={styles.storeLogoImg} width={64} alt="" /> : String(store.name ?? "").slice(0, 1)}
            </span>
            <span className={styles.storeName}>{store.name}</span>
            {store.verified && <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title={labels.verified} aria-label={labels.verified} />}
            {store.distanceText && <span className={styles.storeMeta}>{store.distanceText}</span>}
          </p>
        )}
        <Heading className={styles.title}>{deal.title}</Heading>
        <p className={styles.headline}>
          <span className="sr-only">{deal.label}. </span>
          {deal.headline}
        </p>
        {deal.description && <p className={styles.description}>{deal.description}</p>}

        {savings && (
          <p className={styles.savings}>
            <span>{savings.text}</span>
            <strong className={styles.save}>
              {labels.youSave} {formatKes(savings.save)}
            </strong>
          </p>
        )}

        {steps.length > 0 && (
          <details className={styles.how}>
            <summary className={styles.howSummary}>{labels.how}</summary>
            <ol className={styles.steps}>
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        )}

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

        {(deal.scope === "store" || conditions.length > 0 || !deal.availableNow) && (
          <ul className={styles.conditions} aria-label="Conditions">
            {deal.scope === "store" && <li className={styles.condition}>{labels.wholeShop}</li>}
            {conditions.map((text) => (
              <li key={text} className={styles.condition}>{text}</li>
            ))}
            {!deal.availableNow && <li className={`${styles.condition} ${styles.pause}`}>{labels.onlyNow}</li>}
          </ul>
        )}

        <div className={styles.foot}>
          {deal.code && <CopyCode code={deal.code} labels={labels} disabled={preview} />}
          {ends && <span className={`${styles.ends} ${urgent ? styles.urgent : ""}`}>{ends}</span>}
        </div>
        {validity && <p className={styles.valid}>{labels.valid}: {validity}</p>}
        {deal.terms && <p className={styles.terms}>{deal.terms}</p>}

        {action && (
          <Action {...actionTarget} className={styles.action}>
            {action.icon && <FontAwesomeIcon icon={action.icon} aria-hidden="true" />}
            <span>{action.label}</span>
            {action.trailingIcon && <FontAwesomeIcon icon={action.trailingIcon} aria-hidden="true" />}
          </Action>
        )}
      </div>
    </li>
  );
}

/** Just the tickets, always open: for a page whose whole job is to list offers. */
export function OfferTickets({ offers, mode = "live", onOpenItem, labels }) {
  return (
    <ul className={styles.deals}>
      {offers.map((deal) => (
        <OfferDeal key={deal.id} deal={deal} labels={labels} mode={mode} onOpenItem={onOpenItem} />
      ))}
    </ul>
  );
}

/**
 * The store page's offers, and (as `OfferList`, without the section title) the bar and tickets the product page uses. Each deal is a ticket naming the offer and the products it is on (a shop offer is on the whole shop and lists none); tapping a product opens it.
 * `offers` are deals: { id, kind, title, label, headline, description, code, terms, remainingMs, conditions[], availableNow, products[] }.
 */
export function OfferList({ offers, mode = "live", onOpenItem, labels: given }) {
  const labels = { ...DEFAULT_LABELS, ...given };
  const [opened, setOpened] = useState(false);
  const preview = isPreview(mode);
  const open = opened || preview;
  const panel = useId();
  const tags = offers.slice(0, TAGS);
  const rest = offers.length - tags.length;
  const bar = useRef(null);
  // Escape folds the tickets away and puts focus back on the bar; it stops there, so a dialog around the list stays open.
  const onKeyDown = (event) => {
    if (event.key !== "Escape" || !opened || preview) return;
    event.stopPropagation();
    setOpened(false);
    bar.current?.focus();
  };
  return (
    <>
      <button ref={bar} type="button" className={styles.bar} aria-expanded={open} aria-controls={open ? panel : undefined} onKeyDown={onKeyDown} {...actionProps(preview).button(() => setOpened((v) => !v))}>
        <span className={styles.barStub} aria-hidden="true">
          <FontAwesomeIcon icon={faTicket} className={styles.barIcon} />
          <span className={styles.barCount}>{offers.length}</span>
        </span>
        <span className={styles.barBody}>
          <span className={styles.tags}>
            {tags.map((deal) => (
              <span key={deal.id} className={styles.tag}>{deal.label || deal.title}</span>
            ))}
            {rest > 0 && <span className={styles.tag}>+{rest}</span>}
          </span>
          <span className={styles.claim}>
            {labels.claimNow}
            <FontAwesomeIcon icon={faChevronDown} className={open ? styles.up : styles.chevron} aria-hidden="true" />
          </span>
        </span>
      </button>
      {open && (
        <ul id={panel} className={styles.deals} onKeyDown={onKeyDown}>
          {offers.map((deal) => (
            <OfferDeal key={deal.id} deal={deal} labels={labels} mode={mode} onOpenItem={onOpenItem} />
          ))}
        </ul>
      )}
    </>
  );
}

export default function Offers({ offers, mode = "live", onOpenItem, labels: given }) {
  const labels = { ...DEFAULT_LABELS, ...given };
  return (
    <BusinessSection title={labels.title} id="offers">
      <OfferList offers={offers} mode={mode} onOpenItem={onOpenItem} labels={labels} />
    </BusinessSection>
  );
}
