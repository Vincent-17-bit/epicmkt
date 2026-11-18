import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { buildBrandStory, buildInfoGroups, includeRows, plainSpecs } from "@epicmkt/shared";
import { items as itemsApi } from "../../api/index.js";
import { kesText } from "../../lib/flash.js";
import { itemPagePath } from "../ProductTile.jsx";
import { useSimilar } from "../SimilarItems.jsx";
import styles from "./ItemSections.module.css";
import { useScroller } from "./useScroller.js";

function Arrow({ dir }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// "What's included" (first of the lower sections). Lines with a picture are cards (picture, bold name, details); lines without one are a
// list with a bold dot, the bold name and a colon before the details. The name is always bold, whatever the seller typed.
export function ItemIncluded({ item }) {
  const rows = includeRows(item?.includes, item?.includePhotos);
  if (!rows.length) return null;
  const pictured = rows.filter((r) => r.photo);
  const plain = rows.filter((r) => !r.photo);
  return (
    <section id="item-included" className={styles.section} aria-labelledby="item-included-title">
      <div className={styles.titleRow}>
        <h2 id="item-included-title" className={styles.title}>What's included</h2>
        <span className={styles.count}>{rows.length} {rows.length === 1 ? "item" : "items"}</span>
      </div>
      {pictured.length > 0 && (
        <ul className={styles.incGrid}>
          {pictured.map((r, i) => (
            <li key={`p${i}-${r.name}`} className={styles.incCard}>
              <div className={styles.incFrame}><img src={r.photo} alt={r.name} loading="lazy" decoding="async" /></div>
              <p className={styles.incName}><strong>{r.name}</strong></p>
              {r.details && <p className={styles.incDetails}>{r.details}</p>}
            </li>
          ))}
        </ul>
      )}
      {plain.length > 0 && (
        <ul className={styles.incList}>
          {plain.map((r, i) => (
            <li key={`t${i}-${r.name}`} className={styles.incLine}>
              <span className={styles.incDot} aria-hidden="true" />
              <span><strong className={styles.incLabel}>{r.name}{r.details ? ":" : ""}</strong>{r.details ? <> {r.details}</> : null}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// "Images" (migration 0138): up to 5 pictures the seller chose for the page, above the videos. Every slide has the same 16:9 frame on every
// screen and the picture is shown whole inside it (never stretched or cropped); srcset serves a sharp size for the screen.
export function ItemImages({ item }) {
  const list = item?.galleryImages ?? [];
  const strip = useScroller(list.length);
  if (!list.length) return null;
  const labelled = list.some((g) => g.label);
  const nameOf = (g, i) => g.label || `Image ${i + 1}`;
  return (
    <section id="item-images" className={`${styles.section} ${styles.wide}`} aria-labelledby="item-images-title">
      <h2 id="item-images-title" className={styles.title}>Images</h2>
      {labelled && list.length > 1 && (
        <div className={styles.tabs} role="tablist" aria-label="Images">
          {list.map((g, i) => (
            <button key={`tab-${i}`} type="button" role="tab" id={`item-image-tab-${i}`} aria-selected={i === strip.index} aria-controls={`item-image-${i}`}
              tabIndex={i === strip.index ? 0 : -1} className={styles.tab} onClick={() => strip.go(i)}>{nameOf(g, i)}</button>
          ))}
        </div>
      )}
      <div className={styles.stage}>
        <div ref={strip.ref} className={styles.track} tabIndex={0} onKeyDown={strip.onKeyDown} aria-label={`Images, ${list.length}. Swipe or use the arrow keys.`}>
          {list.map((g, i) => (
            <figure key={`img-${i}`} id={`item-image-${i}`} className={styles.slide} {...(labelled && list.length > 1 ? { role: "tabpanel", "aria-labelledby": `item-image-tab-${i}` } : { "aria-label": `${i + 1} of ${list.length}` })}>
              <div className={styles.frame}>
                <img src={g.url} srcSet={g.srcSet} sizes="(min-width: 1280px) 1180px, 96vw" alt={g.caption || g.label || `${item.name}, picture ${i + 1}`}
                  loading={i === 0 ? "eager" : "lazy"} decoding="async" {...(g.width && g.height ? { width: g.width, height: g.height } : {})} />
              </div>
              {(g.caption || (g.label && !labelled)) && <figcaption className={styles.caption}>{g.caption || g.label}</figcaption>}
            </figure>
          ))}
        </div>
        {strip.arrows && (
          <>
            <button type="button" className={`${styles.arrow} ${styles.arrowPrev}`} onClick={() => strip.go(strip.index - 1)} disabled={strip.prevOff} aria-label="Previous image"><Arrow dir={-1} /></button>
            <button type="button" className={`${styles.arrow} ${styles.arrowNext}`} onClick={() => strip.go(strip.index + 1)} disabled={strip.nextOff} aria-label="Next image"><Arrow dir={1} /></button>
          </>
        )}
      </div>
      {list.length > 1 && (
        <div className={styles.dots} aria-hidden="true">
          {list.map((_, i) => <button key={`dot-${i}`} type="button" tabIndex={-1} className={styles.dot} data-on={i === strip.index ? "" : undefined} onClick={() => strip.go(i)} />)}
        </div>
      )}
    </section>
  );
}

export function ItemVideos({ item }) {
  const videos = (item?.videos ?? []).filter((v) => v?.url);
  const [index, setIndex] = useState(0);
  if (!videos.length) return null;
  const current = videos[Math.min(index, videos.length - 1)];
  return (
    <section id="item-videos" className={styles.section} aria-labelledby="item-videos-title">
      <h2 id="item-videos-title" className={styles.title}>Videos</h2>
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
    </section>
  );
}

// "From the brand" (migration 0138): the brand's achievements as cards (awards, certificates, figures) on a wide banner, swiped or moved
// with the arrows; then the brand's own story blocks, if it wrote any. Cards share one 4:5 frame and show the whole picture.
export function BrandStory({ item }) {
  const page = item?.brandPage ?? null;
  const cards = page?.cards ?? [];
  const strip = useScroller(cards.length);
  const blocks = buildBrandStory(item?.specs);
  if (!blocks.length && !cards.length && !page?.banner) return null;
  const all = (item.images ?? []).filter((m) => m?.url);
  const pool = all.length > 1 ? all.slice(1) : all;
  return (
    <section id="item-brand" className={`${styles.section} ${styles.wide}`} aria-labelledby="item-brand-title">
      <h2 id="item-brand-title" className={styles.title}>From the brand</h2>
      {(cards.length > 0 || page?.banner) && (
        <div className={styles.brandStage} data-banner={page?.banner ? "" : undefined}>
          {page?.banner && <img className={styles.brandBanner} src={page.banner.url} srcSet={page.banner.srcSet} sizes="100vw" alt="" aria-hidden="true" loading="lazy" decoding="async" />}
          {cards.length > 0 && (
            <div ref={strip.ref} className={styles.brandTrack} tabIndex={0} onKeyDown={strip.onKeyDown} aria-label={`${cards.length} ${cards.length === 1 ? "card" : "cards"} from the brand. Swipe or use the arrow keys.`}>
              {cards.map((c, i) => (
                <figure key={`card-${i}`} className={styles.brandCard}>
                  <div className={styles.brandFrame}>
                    <img src={c.url} srcSet={c.srcSet} sizes="(min-width: 900px) 300px, 70vw" alt={c.caption || `From the brand, ${i + 1} of ${cards.length}`} loading="lazy" decoding="async" />
                  </div>
                  {c.caption && <figcaption className={styles.brandCaption}>{c.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
          {strip.arrows && (
            <>
              <button type="button" className={`${styles.arrow} ${styles.arrowPrev}`} onClick={() => strip.go(strip.index - 1)} disabled={strip.prevOff} aria-label="Previous card"><Arrow dir={-1} /></button>
              <button type="button" className={`${styles.arrow} ${styles.arrowNext}`} onClick={() => strip.go(strip.index + 1)} disabled={strip.nextOff} aria-label="Next card"><Arrow dir={1} /></button>
            </>
          )}
        </div>
      )}
      {blocks.length > 0 && (
        <div className={styles.story}>
          {blocks.map((block, i) => {
            const photo = (block.photo && all[block.photo - 1]) || (pool.length ? pool[i % pool.length] : null);
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
      )}
    </section>
  );
}

const AVAILABILITY = { available: "In stock", limited_stock: "Limited stock", by_appointment: "By appointment", made_to_order: "Made to order", pre_order: "Pre-order" };
const SHOWN = 12;
const MAX_COLS = 3;

const amountOf = (item) => {
  const p = item?.pricing;
  if (!p) return null;
  const n = p.hasRange && Number.isFinite(p.priceMin) ? p.priceMin : p.salePrice;
  return Number.isFinite(n) ? n : null;
};

const priceText = (item) => {
  const n = amountOf(item);
  return n === null ? "Ask for the price" : `${item.pricing?.hasRange ? "From " : ""}${kesText(n)}`;
};

const colOf = (item, business) => {
  const shop = item.business ?? business ?? {};
  const rows = new Map();
  const put = (group, label, value) => {
    const v = String(value ?? "").trim();
    if (v && !rows.has(`${group}|${label}`)) rows.set(`${group}|${label}`, v);
  };
  put("Overview", "Sold by", shop.name);
  put("Overview", "Location", shop.townName || shop.town || shop.area || shop.county);
  put("Overview", "Availability", AVAILABILITY[item.availability] ?? (item.availability && item.availability !== "available" ? String(item.availability).replace(/_/g, " ") : "In stock"));
  put("Overview", "Brand", item.brand);
  put("Overview", "Pack size", item.packSize);
  put("Overview", "Options", item.hasOptions ? (item.optionCount > 1 ? `${item.optionCount} options` : "Several options") : "");
  put("Overview", "What's in the box", (item.includes ?? []).join(", "));
  for (const g of buildInfoGroups(item.specs)) for (const r of g.rows) put(g.name, r.label, r.value);
  for (const s of plainSpecs(item.specs)) put("Specifications", s.label, s.value);
  return rows;
};

const ORDER = ["Overview"];

function Cell({ value, mine }) {
  return <td className={styles.cellv} data-mine={mine ? "" : undefined} data-empty={value ? undefined : ""}>{value || "—"}</td>;
}

export function CompareTable({ item, business }) {
  const query = useSimilar(item?.id, false);
  const rows = (Array.isArray(query.data) ? query.data : []).filter((r) => r?.id && r.business?.id && r.id !== item?.id).slice(0, MAX_COLS);
  const details = useQueries({
    queries: rows.map((r) => ({
      queryKey: ["item", r.business.id, r.id],
      queryFn: () => itemsApi.getDetail(r.id, { businessId: r.business.id }),
      staleTime: 60_000,
      retry: false,
      enabled: Boolean(item)
    }))
  });
  const [diff, setDiff] = useState(false);
  const [all, setAll] = useState(false);
  const loading = details.some((d) => d.isPending);
  const cols = useMemo(() => {
    if (!item) return [];
    const list = [{ item, mine: true, map: colOf(item, business) }];
    rows.forEach((r, i) => {
      const full = details[i]?.data;
      const merged = full ? { ...r, ...full, business: full.business ?? r.business } : r;
      list.push({ item: merged, mine: false, map: colOf(merged, r.business) });
    });
    return list;
  }, [item, business, rows.map((r) => r.id).join(), details.map((d) => d.dataUpdatedAt).join()]);

  if (!item || rows.length < 1) return null;

  const keys = [];
  const seen = new Set();
  for (const c of cols) for (const k of c.map.keys()) if (!seen.has(k)) { seen.add(k); keys.push(k); }
  const groups = [];
  for (const k of keys) {
    const [group, label] = k.split("|");
    let g = groups.find((x) => x.name === group);
    if (!g) { g = { name: group, rows: [] }; groups.push(g); }
    const values = cols.map((c) => c.map.get(k) ?? "");
    const filled = values.filter(Boolean);
    const same = filled.length === cols.length && new Set(filled).size === 1;
    g.rows.push({ key: k, label, values, same });
  }
  const spec = groups.find((x) => x.name === "Specifications");
  if (spec) {
    const others = groups.filter((x) => x !== spec).flatMap((x) => x.rows);
    spec.rows = spec.rows.filter((r) => {
      const twin = others.find((o) => o.label.toLowerCase() === r.label.toLowerCase());
      if (!twin) return true;
      twin.values = twin.values.map((v, i) => v || r.values[i]);
      const filled = twin.values.filter(Boolean);
      twin.same = filled.length === cols.length && new Set(filled).size === 1;
      return false;
    });
    if (!spec.rows.length) groups.splice(groups.indexOf(spec), 1);
  }
  groups.sort((a, b) => (ORDER.indexOf(a.name) === -1 ? 99 : ORDER.indexOf(a.name)) - (ORDER.indexOf(b.name) === -1 ? 99 : ORDER.indexOf(b.name)));
  const visibleGroups = groups.map((g) => ({ ...g, rows: diff ? g.rows.filter((r) => !r.same) : g.rows })).filter((g) => g.rows.length);
  const total = visibleGroups.reduce((n, g) => n + g.rows.length, 0);
  let left = all ? Infinity : SHOWN;
  const shownGroups = visibleGroups.map((g) => {
    const take = g.rows.slice(0, Math.max(left, 0));
    left -= take.length;
    return { ...g, rows: take };
  }).filter((g) => g.rows.length);

  const prices = cols.map((c) => amountOf(c.item));
  const best = Math.min(...prices.filter((n) => n !== null));
  const bestIndex = Number.isFinite(best) && prices.filter((n) => n === best).length === 1 ? prices.indexOf(best) : -1;

  return (
    <section id="item-compare" className={styles.section} aria-labelledby="item-compare-title" aria-busy={loading || undefined}>
      <div className={styles.head}>
        <div>
          <h2 id="item-compare-title" className={styles.title}>Compare with similar items</h2>
          <p className={styles.sub}>{loading ? "Loading product details" : `${total} ${total === 1 ? "feature" : "features"} across ${cols.length} items`}</p>
        </div>
        <label className={styles.switch}>
          <input type="checkbox" checked={diff} onChange={(e) => { setDiff(e.target.checked); setAll(false); }} />
          <span>Show differences only</span>
        </label>
      </div>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label="Comparison table">
        <table className={styles.table} style={{ "--cols": cols.length }}>
          <thead>
            <tr>
              <th scope="col" className={styles.corner}><span className={styles.hidden}>Feature</span></th>
              {cols.map((c, i) => (
                <th key={c.item.id} scope="col" className={styles.colHead} data-mine={c.mine ? "" : undefined}>
                  <span className={styles.tags}>
                    {c.mine && <span className={styles.this}>This item</span>}
                    {i === bestIndex && <span className={styles.best}>Lowest price</span>}
                  </span>
                  {c.item.imageUrl || c.item.images?.[0]?.url ? <img className={styles.thumb} src={c.item.imageUrl || c.item.images[0].url} alt="" loading="lazy" /> : <span className={styles.thumb} />}
                  {c.mine ? <span className={styles.name}>{c.item.name}</span> : <Link className={styles.name} to={itemPagePath(c.item)}>{c.item.name}</Link>}
                  <span className={styles.price}>{priceText(c.item)}</span>
                  {!c.mine && <Link className={styles.view} to={itemPagePath(c.item)}>View item</Link>}
                </th>
              ))}
            </tr>
          </thead>
          {shownGroups.map((g) => (
            <tbody key={g.name}>
              <tr><th scope="colgroup" colSpan={cols.length + 1} className={styles.groupHead}>{g.name}</th></tr>
              {g.rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className={styles.rowHead}>{r.label}</th>
                  {r.values.map((v, i) => <Cell key={cols[i].item.id} value={v} mine={cols[i].mine} />)}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {!all && total > SHOWN && (
        <button type="button" className={styles.more} onClick={() => setAll(true)}>Show all {total} features</button>
      )}
      {diff && total === 0 && <p className={styles.sub}>These items match on every feature they list.</p>}
    </section>
  );
}
