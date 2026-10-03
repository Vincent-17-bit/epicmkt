import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faChevronRight, faEllipsis, faHouse } from "@fortawesome/free-solid-svg-icons";
import { t } from "../../i18n/index.js";
import Skeleton from "../Skeleton.jsx";
import styles from "./Breadcrumbs.module.css";

const MOBILE = "(max-width: 767.98px)";
const ANCESTOR_MAX = 24;
const CURRENT_MAX = 40;

function useMobile(force) {
  const [mobile, setMobile] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(MOBILE).matches : false));
  useEffect(() => {
    if (force !== undefined || typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia(MOBILE);
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [force]);
  return force ?? mobile;
}

function Separator() {
  return <FontAwesomeIcon icon={faChevronRight} className={styles.sep} aria-hidden="true" />;
}

function CrumbLink({ crumb, index, onCrumbClick, onCrumbIntent }) {
  const isHome = crumb.icon === "house";
  return (
    <Link
      to={crumb.to}
      className={`${styles.link} ${isHome ? styles.home : ""}`}
      title={crumb.label.length > ANCESTOR_MAX ? crumb.label : undefined}
      aria-label={isHome ? crumb.label : undefined}
      onClick={() => onCrumbClick?.(crumb, index)}
      onMouseEnter={() => onCrumbIntent?.(crumb)}
      onFocus={() => onCrumbIntent?.(crumb)}
    >
      {isHome && <FontAwesomeIcon icon={faHouse} className={styles.icon} aria-hidden="true" />}
      <span className={isHome ? styles.homeText : styles.text}>{crumb.label}</span>
    </Link>
  );
}

function MoreMenu({ items, offset, onCrumbClick, onCrumbIntent }) {
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (event) => {
      if (!box.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span className={styles.more} ref={box}>
      <button
        ref={button}
        type="button"
        className={styles.moreBtn}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t("breadcrumb.more")}
        onClick={() => setOpen((v) => !v)}
      >
        <FontAwesomeIcon icon={faEllipsis} aria-hidden="true" />
      </button>
      {open && (
        <ul className={styles.popover}>
          {items.map((crumb, i) => (
            <li key={crumb.key}>
              <Link
                to={crumb.to}
                className={styles.popLink}
                onClick={() => {
                  setOpen(false);
                  onCrumbClick?.(crumb, offset + i);
                }}
                onMouseEnter={() => onCrumbIntent?.(crumb)}
                onFocus={() => onCrumbIntent?.(crumb)}
              >
                {crumb.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

export default function Breadcrumbs({ trail = [], loading = false, back = null, compact, onCrumbClick, onCrumbIntent }) {
  const mobile = useMobile(compact);
  const last = trail.length - 1;
  const collapse = mobile && trail.length > 4;
  const hidden = collapse ? trail.slice(1, last - 1) : [];

  const parts = collapse
    ? [
        { crumb: trail[0], index: 0 },
        { more: true },
        { crumb: trail[last - 1], index: last - 1 },
        { crumb: trail[last], index: last }
      ]
    : trail.map((crumb, index) => ({ crumb, index }));

  return (
    <div className={styles.bar} aria-busy={loading || undefined}>
      <nav className={styles.trail} aria-label={t("breadcrumb.label")}>
        <ol className={styles.list}>
          {loading ? (
            <>
              <li className={styles.item}>
                <Link to="/" className={`${styles.link} ${styles.home}`} aria-label={t("breadcrumb.home")}>
                  <FontAwesomeIcon icon={faHouse} className={styles.icon} aria-hidden="true" />
                  <span className={styles.homeText}>{t("breadcrumb.home")}</span>
                </Link>
              </li>
              <li className={styles.item}>
                <Separator />
                <Skeleton width="min(12rem, 45vw)" height="1rem" />
              </li>
            </>
          ) : (
            parts.map((part, i) => (
              <li key={part.more ? "more" : part.crumb.key} className={styles.item}>
                {i > 0 && <Separator />}
                {part.more ? (
                  <MoreMenu items={hidden} offset={1} onCrumbClick={onCrumbClick} onCrumbIntent={onCrumbIntent} />
                ) : part.index === last ? (
                  <span className={styles.current} aria-current="page" title={part.crumb.label.length > CURRENT_MAX ? part.crumb.label : undefined}>
                    {part.crumb.label}
                  </span>
                ) : (
                  <CrumbLink crumb={part.crumb} index={part.index} onCrumbClick={onCrumbClick} onCrumbIntent={onCrumbIntent} />
                )}
              </li>
            ))
          )}
        </ol>
      </nav>
      {back && (
        <button type="button" className={styles.back} onClick={back.onClick}>
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          {back.label}
        </button>
      )}
    </div>
  );
}
