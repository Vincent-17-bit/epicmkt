import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { buildBrandStory, buildInfoGroups, plainSpecs } from "@epicmkt/shared";
import { items as itemsApi } from "../../api/index.js";
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
  const all = (item.images ?? []).filter((m) => m?.url);
  const pool = all.length > 1 ? all.slice(1) : all;
  return (
    <section id="item-brand" className={styles.section} aria-labelledby="item-brand-title">
      <h2 id="item-brand-title" className={styles.title}>From the brand</h2>
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
