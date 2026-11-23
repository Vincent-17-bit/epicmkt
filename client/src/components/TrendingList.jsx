import { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { resizeImageUrl } from "@epicmkt/shared";
import { trendLabel } from "../hooks/useTrending.js";
import Flame from "./Flame.jsx";
import { TrendKind } from "./TrendTabs.jsx";
import styles from "./TrendingList.module.css";

function Pic({ src, size }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={styles.pic} aria-hidden="true">
      {src && !broken ? (
        <img src={resizeImageUrl(src, size * 2)} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <FontAwesomeIcon icon={faMagnifyingGlass} />
      )}
    </span>
  );
}

function Row({ item, rank, top, href, onPick }) {
  const body = (
    <>
      {rank ? <span className={styles.rank}>{rank}</span> : null}
      <Pic src={item.image} size={top ? 64 : 44} />
      <span className={styles.text}>
        {top && (
          <span className={styles.badge}>
            <Flame className={styles.badgeFlame} /> Top trending
          </span>
        )}
        <span className={styles.name}>{trendLabel(item)}</span>
        {top && (
          <span className={styles.meta}>
            <TrendKind kind={item.kind} />
          </span>
        )}
      </span>
      {!top && <TrendKind kind={item.kind} />}
    </>
  );
  const props = { className: styles.row, "data-top": top || undefined };
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
