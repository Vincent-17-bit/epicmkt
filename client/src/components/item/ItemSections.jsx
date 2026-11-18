import { useState } from "react";
import { Link } from "react-router-dom";
import { buildBrandStory } from "@epicmkt/shared";
import { kesText } from "../../lib/flash.js";
import { itemPagePath } from "../ProductTile.jsx";
import { useSimilar } from "../SimilarItems.jsx";
import styles from "./ItemSections.module.css";

function Check() {
  return (
    <svg viewBox="0 0 12 10" width="14" height="12" aria-hidden="true" className={styles.tick}>
      <path d="M1 5.5l3.5 3.5L11 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ItemVideos({ item }) {
  const videos = (item?.videos ?? []).filter((v) => v?.url);
  const includes = (item?.includes ?? []).filter(Boolean);
  const [index, setIndex] = useState(0);
  if (!videos.length && !includes.length) return null;
  const current = videos[Math.min(index, videos.length - 1)];
  return (
    <section id="item-videos" className={styles.section} aria-labelledby="item-videos-title">
      <h2 id="item-videos-title" className={styles.title}>{videos.length ? "Videos" : "What's in the box"}</h2>
      <div className={styles.videoGrid} data-solo={videos.length && !includes.length ? "" : undefined}>
        {videos.length > 0 && (
          <div className={styles.player}>
            <video key={current.url} className={styles.video} src={current.url} poster={current.poster || undefined} controls preload="metadata" playsInline />
            {videos.length > 1 && (
              <ul className={styles.reel}>
                {videos.map((v, i) => (
                  <li key={v.id ?? v.url}>
                    <button type="button" className={styles.reelBtn} aria-pressed={i === index} onClick={() => setIndex(i)}>
                      {v.caption || `Video ${i + 1}`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {includes.length > 0 && (
          <div className={styles.box}>
            {videos.length > 0 && <h3 className={styles.boxTitle}>What's in the box</h3>}
            <ul className={styles.checks}>
              {includes.map((entry) => (
                <li key={entry} className={styles.check}><Check /><span>{entry}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export function BrandStory({ item }) {
  const blocks = buildBrandStory(item?.specs);
  if (!blocks.length) return null;
  const photos = (item.images ?? []).filter((m) => m?.url).slice(1);
  return (
    <section id="item-brand" className={styles.section} aria-labelledby="item-brand-title">
      <h2 id="item-brand-title" className={styles.title}>From the brand</h2>
      <div className={styles.story}>
        {blocks.map((block, i) => {
          const photo = photos[i];
          return (
            <article key={`${i}-${block.heading}`} className={styles.block} data-flip={i % 2 ? "" : undefined} data-solo={photo ? undefined : ""}>
              {photo && <img className={styles.shot} src={photo.url} alt={photo.caption || block.heading} loading="lazy" decoding="async" />}
              <div className={styles.copy}>
                <h3 className={styles.heading}>{block.heading}</h3>
                <p className={styles.text}>{block.text}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const priceOf = (row) => {
  const p = row.pricing;
  if (!p) return "Ask for the price";
  const n = p.hasRange && Number.isFinite(p.priceMin) ? p.priceMin : p.salePrice;
  return Number.isFinite(n) ? `${p.hasRange ? "From " : ""}${kesText(n)}` : "Ask for the price";
};

export function CompareTable({ item, business }) {
  const query = useSimilar(item?.id, false);
  if (!item) return null;
  const rows = (Array.isArray(query.data) ? query.data : []).filter((r) => r?.id && r.business?.slug && r.id !== item.id).slice(0, 3);
  if (rows.length < 1) return null;
  const mine = { id: item.id, name: item.name, brand: item.brand, pricing: item.pricing, business, imageUrl: item.imageUrl, hasOptions: item.hasOptions };
  const cols = [mine, ...rows];
  const cell = (row) => ({
    Price: priceOf(row),
    Brand: row.brand || "—",
    "Sold by": row.business?.name || "—",
    Location: row.business?.town || row.business?.area || row.business?.county || "—",
    Options: row.hasOptions ? "Several options" : "Single option"
  });
  const keys = Object.keys(cell(mine));
  return (
    <section id="item-compare" className={styles.section} aria-labelledby="item-compare-title">
      <h2 id="item-compare-title" className={styles.title}>Compare with similar items</h2>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label="Comparison table">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.corner}><span className={styles.hidden}>Feature</span></th>
              {cols.map((row, i) => (
                <th key={row.id} scope="col" className={styles.colHead} data-mine={i === 0 ? "" : undefined}>
                  {i === 0 ? <span className={styles.this}>This item</span> : null}
                  {row.imageUrl ? <img className={styles.thumb} src={row.imageUrl} alt="" loading="lazy" /> : null}
                  {i === 0 ? <span className={styles.name}>{row.name}</span> : <Link className={styles.name} to={itemPagePath(row)}>{row.name}</Link>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <th scope="row" className={styles.rowHead}>{key}</th>
                {cols.map((row, i) => (
                  <td key={row.id} className={styles.cellv} data-mine={i === 0 ? "" : undefined}>{cell(row)[key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
