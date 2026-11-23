import { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faBolt, faMagnifyingGlass, faStore, faTags } from "@fortawesome/free-solid-svg-icons";
import { resizeImageUrl } from "@epicmkt/shared";
import { trendLabel } from "../hooks/useTrending.js";
import Flame from "./Flame.jsx";
import { TrendKind } from "./TrendKind.jsx";
import styles from "./TrendingList.module.css";

// With no picture (or one that fails to load) the tile shows what the word is: a shop, a category, a flash sale, or a plain search.
const KIND_ICON = { store: faStore, category: faTags, flash: faBolt };

function Pic({ src, size, kind }) {
  const [failed, setFailed] = useState(null);
  const ok = src && failed !== src;
  return (
    <span className={styles.pic} aria-hidden="true">
      {ok ? (
        <img src={resizeImageUrl(src, size * 2)} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(src)} />
      ) : (
        <FontAwesomeIcon icon={KIND_ICON[kind] ?? faMagnifyingGlass} />
      )}
    </span>
  );
}

// "Rising" mark: this word is climbing fast this week. 1 is the fastest riser of all; the rest just say "Rising".
export function Rise({ place }) {
  if (!place) return null;
  const fastest = place === 1;
  return (
    <span className={styles.rise} data-fastest={fastest || undefined}>
      <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
      {fastest ? "Fastest rising" : "Rising"}
    </span>
  );
}

function Row({ item, rank, top, href, onPick }) {
  const body = (
    <>
      {rank ? <span className={styles.rank}>{rank}</span> : null}
      <Pic src={item.image} size={top ? 64 : 44} kind={item.kind} />
      <span className={styles.text}>
        {top && (
          <span className={styles.badge}>
            <Flame className={styles.badgeFlame} /> Top search
          </span>
        )}
        <span className={styles.name}>{trendLabel(item)}</span>
        {top && (
          <span className={styles.meta}>
            <TrendKind kind={item.kind} />
            <Rise place={item.rising} />
          </span>
        )}
      </span>
      {!top && (
        <span className={styles.tags}>
          <Rise place={item.rising} />
          <TrendKind kind={item.kind} />
        </span>
      )}
    </>
  );
  const props = { className: styles.row, "data-top": top || undefined, "data-fastest": (!top && item.rising === 1) || undefined };
  return href ? (
    <Link to={href} replace {...props} onClick={() => onPick(item)}>
      {body}
    </Link>
  ) : (
    <button type="button" {...props} onClick={() => onPick(item)}>
      {body}
    </button>
  );
}

export default function TrendingList({ items, ranked = true, hrefFor, onPick }) {
  if (!items.length) return null;
  return (
    <div className={styles.box}>
      <ol className={styles.list} data-ranked={ranked || undefined}>
        {items.map((item, index) => (
          <li key={item.term} className={ranked && index === 0 ? styles.first : undefined}>
            <Row item={item} rank={ranked ? index + 1 : 0} top={ranked && index === 0} href={hrefFor?.(item)} onPick={onPick} />
          </li>
        ))}
      </ol>
    </div>
  );
}
