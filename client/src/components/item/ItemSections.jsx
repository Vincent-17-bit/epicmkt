import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { buildInfoGroups, includeRows, plainSpecs } from "@epicmkt/shared";
import { items as itemsApi } from "../../api/index.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { kesText } from "../../lib/flash.js";
import { itemPagePath } from "../ProductTile.jsx";
import { useSimilar } from "../SimilarItems.jsx";
import styles from "./ItemSections.module.css";
import { useScroller } from "./useScroller.js";

// The item's own sections under the product rows (What's included, Images, Videos, Product information, From the brand, Compare).
// On the item page each is a white panel like the "Goes well with" and "Similar products" rows above them (the frame is in
// ItemDetail.module.css); in the pop-up they are separated by a rule. Every panel starts with the same heading line, and pictures and
// players run to the panel's edges on phones so nothing is spent on padding.

export const PHONE = "(max-width: 39.99rem)";

/** The heading line every section starts with: the title, a short note under it, and anything for the right-hand side. */
export function SectionHead({ id, title, note, children }) {
  return (
    <div className={styles.head}>
      <div className={styles.headText}>
        <h2 id={id} className={styles.title}>{title}</h2>
        {note ? <p className={styles.note}>{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Arrow({ dir }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// What's included
// ---------------------------------------------------------------------------------------------------------------------------------

// Lines with a picture are tiles (picture, bold name, details under it); lines without one are a list with a bold dot, the bold name and
// a colon before the details. The name is always bold, whatever the seller typed.
export function ItemIncluded({ item }) {
  const rows = includeRows(item?.includes, item?.includePhotos);
  if (!rows.length) return null;
  const pictured = rows.filter((r) => r.photo);
  const plain = rows.filter((r) => !r.photo);
  return (
    <section id="item-included" className={styles.section} aria-labelledby="item-included-title">
      <SectionHead id="item-included-title" title="What's included" note={`${plural(rows.length, "item")} in the box`} />
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
        <ul className={styles.incList} data-after={pictured.length ? "" : undefined}>
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

// ---------------------------------------------------------------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------------------------------------------------------------

// Up to 5 pictures the seller chose, above the videos, as one dark showcase like a brand's picture tour on Amazon: the pictures' names on
// a bar across the top (the one showing underlined), the picture filling the frame, thin arrows at its sides and its caption over the
// bottom of it (under it on phones, where the names or the dots are used instead of arrows). Every slide has the same 16:9 frame; a
// picture of another shape is shown whole on the dark background instead of being stretched or cropped. srcset serves a size that stays
// sharp on the screen. The showcase is never taller than the screen, so the names, the picture and its caption are seen at once.
const FRAME = 16 / 9;
const fills = (g) => g.width > 0 && g.height > 0 && Math.abs(g.width / g.height / FRAME - 1) <= 0.03;

function Chevron({ dir }) {
  return (
    <svg viewBox="0 0 20 48" width="20" height="48" aria-hidden="true">
      <path d={dir < 0 ? "M17 3L3 24l14 21" : "M3 3l14 21L3 45"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ItemImages({ item }) {
  const list = item?.galleryImages ?? [];
  const strip = useScroller(list.length);
  const bar = useRef(null);
  // The name of the picture showing stays in view when the bar scrolls (phones, long names). Only the bar moves, never the page.
  useEffect(() => {
    const el = bar.current;
    const tab = el?.children?.[strip.index];
    if (!el || !tab || el.scrollWidth <= el.clientWidth) return;
    const left = tab.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft - (el.clientWidth - tab.offsetWidth) / 2;
    if (typeof el.scrollTo === "function") el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [strip.index]);
  if (!list.length) return null;
  const many = list.length > 1;
  const tabs = many && list.some((g) => g.label);
  const nameOf = (g, i) => g.label || `Image ${i + 1}`;
  const onTabKey = (e) => {
    const last = list.length - 1;
    const to = { ArrowRight: strip.index + 1, ArrowLeft: strip.index - 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const n = Math.max(0, Math.min(last, to));
    strip.go(n);
    bar.current?.children?.[n]?.focus();
  };
  return (
    <section id="item-images" className={styles.section} aria-labelledby="item-images-title">
      <SectionHead id="item-images-title" title="Images">
        {many && <p className={styles.counter} aria-hidden="true">{strip.index + 1} / {list.length}</p>}
      </SectionHead>
      <div className={`${styles.show} ${styles.bleed}`} data-captions={list.some((g) => g.caption) ? "" : undefined}>
        {tabs && (
          <div ref={bar} className={styles.showBar} role="tablist" aria-label="Images" onKeyDown={onTabKey}>
            {list.map((g, i) => (
              <button key={`tab-${i}`} type="button" role="tab" id={`item-image-tab-${i}`} aria-selected={i === strip.index} aria-controls={`item-image-${i}`}
                tabIndex={i === strip.index ? 0 : -1} className={styles.showTab} onClick={() => strip.go(i)}>{nameOf(g, i)}</button>
            ))}
          </div>
        )}
        <div className={styles.stage}>
          <div ref={strip.ref} className={styles.track} tabIndex={0} onKeyDown={strip.onKeyDown} aria-label={`Images, ${list.length}. Swipe or use the arrow keys.`}>
            {list.map((g, i) => (
              <figure key={`img-${i}`} id={`item-image-${i}`} className={styles.slide} {...(tabs ? { role: "tabpanel", "aria-labelledby": `item-image-tab-${i}` } : { "aria-label": `${i + 1} of ${list.length}` })}>
                <div className={styles.frame} data-fill={fills(g) ? "" : undefined}>
                  <img src={g.url} srcSet={g.srcSet || undefined} sizes="(min-width: 80rem) 1280px, 100vw" alt={g.caption || g.label || `${item.name}, picture ${i + 1}`}
                    loading={i === 0 ? "eager" : "lazy"} decoding="async" draggable="false" {...(g.width && g.height ? { width: g.width, height: g.height } : {})} />
                </div>
                {(g.caption || (g.label && !tabs)) && <figcaption className={styles.caption}>{g.caption || g.label}</figcaption>}
              </figure>
            ))}
          </div>
          {strip.arrows && (
            <>
              <button type="button" className={`${styles.chevron} ${styles.chevronPrev}`} onClick={() => strip.go(strip.index - 1)} disabled={strip.prevOff} aria-label="Previous image"><Chevron dir={-1} /></button>
              <button type="button" className={`${styles.chevron} ${styles.chevronNext}`} onClick={() => strip.go(strip.index + 1)} disabled={strip.nextOff} aria-label="Next image"><Chevron dir={1} /></button>
            </>
          )}
        </div>
        {many && !tabs && (
          <div className={styles.showDots} aria-hidden="true">
            {list.map((_, i) => <button key={`dot-${i}`} type="button" tabIndex={-1} className={styles.showDot} data-on={i === strip.index ? "" : undefined} onClick={() => strip.go(i)} />)}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------------------------------------------------------------

const clock = (s) => {
  const n = Math.round(Number(s));
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

function Play() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </svg>
  );
}

// One player and, with more than one video, a list of them like Amazon's "Videos for this product": a thumbnail with a play mark and
// the length, the title and who made it. Beside the player on big screens, a swipeable row under it on phones. Picking one plays it.
// A video without a poster gets a plain dark thumbnail: loading every video just to draw its first frame would cost buyers data.
export function ItemVideos({ item }) {
  const videos = (item?.videos ?? []).filter((v) => v?.url);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(false);
  if (!videos.length) return null;
  const at = Math.min(index, videos.length - 1);
  const current = videos[at];
  // The live API gives each video the item's name as its caption; that says nothing, so those are numbered instead.
  const titleOf = (v, i) => (v.caption && v.caption !== item?.name ? v.caption : `Video ${i + 1}`);
  return (
    <section id="item-videos" className={styles.section} aria-labelledby="item-videos-title">
      <SectionHead id="item-videos-title" title="Videos" note={videos.length > 1 ? plural(videos.length, "video") : ""} />
      <div className={styles.videoGrid} data-solo={videos.length === 1 ? "" : undefined}>
        <div className={`${styles.player} ${styles.bleed}`}>
          <video key={current.url} className={styles.video} src={current.url} poster={current.poster || undefined} controls preload="metadata" playsInline autoPlay={picked}
            aria-label={titleOf(current, at)} />
        </div>
        {videos.length > 1 && (
          <ol className={styles.reel} aria-label="Videos for this product">
            {videos.map((v, i) => (
              <li key={v.id ?? v.url} className={styles.reelItem}>
                <button type="button" className={styles.reelBtn} aria-current={i === at ? "true" : undefined} onClick={() => { setIndex(i); setPicked(true); }}>
                  <span className={styles.reelThumb}>
                    {v.poster && <img src={v.poster} alt="" loading="lazy" decoding="async" />}
                    <span className={styles.reelPlay}><Play /></span>
                    {clock(v.duration) && <span className={styles.reelTime}>{clock(v.duration)}</span>}
                    {i === at && <span className={styles.reelNow}>Now playing</span>}
                  </span>
                  <span className={styles.reelText}>
                    <span className={styles.reelTitle}>{titleOf(v, i)}</span>
                    {v.by && <span className={styles.reelBy}>{v.by}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// From the brand
// ---------------------------------------------------------------------------------------------------------------------------------

// The brand's achievements as cards (awards, certificates, figures) over a wide banner, like Amazon's brand story: swiped, or moved with
// the arrows at the edges. Cards share one 4:5 frame, show the whole picture and carry their caption inside the card, so it can be read
// over any banner. Nothing else: the older text-and-photo story blocks are not shown. A banner with no cards is shown on its own.
export function BrandStory({ item }) {
  const page = item?.brandPage ?? null;
  const cards = page?.cards ?? [];
  const strip = useScroller(cards.length);
  if (!cards.length && !page?.banner) return null;
  const banner = page?.banner ?? null;
  return (
    <section id="item-brand" className={styles.section} aria-labelledby="item-brand-title">
      <SectionHead id="item-brand-title" title="From the brand" note={item?.brand ?? ""} />
      {cards.length === 0 ? (
        <img className={`${styles.brandSolo} ${styles.bleed}`} src={banner.url} srcSet={banner.srcSet || undefined} sizes="(min-width: 80rem) 1280px, 100vw" alt={item?.brand ? `${item.brand}` : "From the brand"} loading="lazy" decoding="async" />
      ) : (
        <div className={`${styles.brandStage} ${styles.bleed}`} data-banner={banner ? "" : undefined}>
          {banner && <img className={styles.brandBanner} src={banner.url} srcSet={banner.srcSet || undefined} sizes="100vw" alt="" aria-hidden="true" loading="lazy" decoding="async" />}
          <div ref={strip.ref} className={styles.brandTrack} tabIndex={0} onKeyDown={strip.onKeyDown} aria-label={`${plural(cards.length, "card")} from the brand. Swipe or use the arrow keys.`}>
            {cards.map((c, i) => (
              <figure key={`card-${i}`} className={styles.brandCard}>
                <div className={styles.brandFrame}>
                  <img src={c.url} srcSet={c.srcSet || undefined} sizes="(min-width: 64rem) 280px, 60vw" alt={c.caption || `From the brand, ${i + 1} of ${cards.length}`} loading="lazy" decoding="async" />
                </div>
                {c.caption && <figcaption className={styles.brandCaption}>{c.caption}</figcaption>}
              </figure>
            ))}
          </div>
          {strip.arrows && (
            <>
              <button type="button" className={`${styles.edgeArrow} ${styles.edgePrev}`} onClick={() => strip.go(strip.index - 1)} disabled={strip.prevOff} aria-label="Previous card"><Arrow dir={-1} /></button>
              <button type="button" className={`${styles.edgeArrow} ${styles.edgeNext}`} onClick={() => strip.go(strip.index + 1)} disabled={strip.nextOff} aria-label="Next card"><Arrow dir={1} /></button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Compare with similar items
// ---------------------------------------------------------------------------------------------------------------------------------

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

const pictureOf = (item) => item.imageUrl || item.images?.[0]?.url || "";

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
  const phone = useMediaQuery(PHONE);
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
  // On a phone there is no room for a column of names: each feature's name is a line across the table, above its values, and the
  // items are side by side under it (two at a time, the rest a swipe away). Everywhere else the names are the first column.
  const span = phone ? cols.length : cols.length + 1;
  const colId = (i) => `compare-col-${i}`;

  return (
    <section id="item-compare" className={styles.section} aria-labelledby="item-compare-title" aria-busy={loading || undefined}>
      <SectionHead id="item-compare-title" title="Compare with similar items" note={loading ? "Loading product details" : `${plural(total, "feature")} across ${cols.length} items`}>
        <label className={styles.switch}>
          <input type="checkbox" role="switch" checked={diff} onChange={(e) => { setDiff(e.target.checked); setAll(false); }} />
          <span className={styles.switchTrack} aria-hidden="true" />
          <span>Show differences only</span>
        </label>
      </SectionHead>
      <div className={`${styles.scroll} ${styles.bleed}`} tabIndex={0} role="region" aria-label="Comparison table">
        <table className={styles.table} style={{ "--cols": cols.length }} data-phone={phone ? "" : undefined}>
          <thead>
            <tr>
              {!phone && <th scope="col" className={styles.corner}><span className={styles.hidden}>Feature</span></th>}
              {cols.map((c, i) => (
                <th key={c.item.id} id={colId(i)} scope="col" className={styles.colHead} data-mine={c.mine ? "" : undefined}>
                  <span className={styles.tags}>
                    {c.mine && <span className={styles.this}>This item</span>}
                    {i === bestIndex && <span className={styles.best}>Lowest price</span>}
                  </span>
                  {pictureOf(c.item) ? <img className={styles.thumb} src={pictureOf(c.item)} alt="" loading="lazy" decoding="async" /> : <span className={styles.thumb} />}
                  {c.mine ? <span className={styles.name}>{c.item.name}</span> : <Link className={styles.name} to={itemPagePath(c.item)}>{c.item.name}</Link>}
                  <span className={styles.price}>{priceText(c.item)}</span>
                  {!c.mine && <Link className={styles.view} to={itemPagePath(c.item)} aria-label={`View ${c.item.name}`}>View item</Link>}
                </th>
              ))}
            </tr>
          </thead>
          {shownGroups.map((g, gi) => (
            <tbody key={g.name}>
              <tr><th scope="colgroup" colSpan={span} className={styles.groupHead}><span className={styles.stick}>{g.name}</span></th></tr>
              {g.rows.map((r, ri) => {
                const rowId = `compare-row-${gi}-${ri}`;
                return phone ? (
                  [
                    <tr key={`${r.key}-name`} className={styles.labelRow}><th id={rowId} scope="colgroup" colSpan={span} className={styles.labelCell}><span className={styles.stick}>{r.label}</span></th></tr>,
                    <tr key={r.key} className={styles.valueRow}>
                      {r.values.map((v, i) => (
                        <td key={cols[i].item.id} headers={`${rowId} ${colId(i)}`} className={styles.cellv} data-mine={cols[i].mine ? "" : undefined} data-empty={v ? undefined : ""}>{v || "—"}</td>
                      ))}
                    </tr>
                  ]
                ) : (
                  <tr key={r.key} className={styles.valueRow}>
                    <th scope="row" className={styles.rowHead}>{r.label}</th>
                    {r.values.map((v, i) => (
                      <td key={cols[i].item.id} className={styles.cellv} data-mine={cols[i].mine ? "" : undefined} data-empty={v ? undefined : ""}>{v || "—"}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      {total > SHOWN && (
        <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer features" : `Show all ${total} features`}
          <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true" data-up={all ? "" : undefined}><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      {diff && total === 0 && <p className={styles.note}>These items match on every feature they list.</p>}
    </section>
  );
}
