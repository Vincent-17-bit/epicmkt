// What the Saved drawer shows, worked out from three things: the lines on this device (savedList), today's data (items.getSaved) and the
// clock. Pure: no React, no storage. Prices come from lineFor (via savedLine); nothing here multiplies a price by a quantity. Totals are
// sums of whole-KES line totals, and a line with no total is shown but left out (Part E).
import { formatKes, lineTotal, quantityRules } from "@epicmkt/shared";
import { coverUrl } from "@epicmkt/ui";
import { savedLine } from "../../lib/lineFor.js";
import { t } from "../../i18n/index.js";

export const fill = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), t(key));

const finite = Number.isFinite;

// The item a line points at today, following a merge ("the seller combined it into another") without touching the stored line.
function resolve(entry, data) {
  const items = data?.items ?? {};
  let item = items[entry.itemId] ?? null;
  let optionParam = entry.optionParam;
  const to = !item ? data?.redirects?.[entry.itemId] : null;
  if (to) {
    item = items[to.itemId] ?? null;
    if (item) optionParam = to.param || "";
  }
  return { item, optionParam, itemId: item?.id ?? entry.itemId, redirected: Boolean(to && item) };
}

const chip = (tone, text) => ({ tone, text });

// Has today's data said anything about this line yet? A line saved a moment ago may not be in an older answer: it draws from its snapshot
// until the next refresh, and is never called "unavailable" just because it was not asked about.
const known = (entry, data) => Boolean(data) && (entry.itemId in (data.items ?? {}) || Boolean(data.redirects?.[entry.itemId]));

/** One line, as the drawer draws it. `data` is null while nothing has loaded (and offline): then the snapshot is all there is. */
export function lineView(entry, data, { shopGone = false } = {}) {
  const snap = entry.snap ?? {};
  const service = entry.kind === "service";
  const base = {
    key: entry.key,
    entry,
    name: snap.name || "",
    image: snap.image || null,
    optionLabel: entry.optionLabel || "",
    service,
    businessId: entry.businessId,
    href: null,
    status: "snapshot",
    qty: entry.qty,
    total: null,
    unit: null,
    rules: null,
    mode: "units",
    chip: null,
    note: "",
    link: true,
    redirected: false
  };

  // Offline, or the first load has not come back: draw from the snapshot, with its own price.
  if (!data || !known(entry, data)) {
    const unit = finite(snap.unit) ? snap.unit : null;
    const measure = snap.mode === "measure" && snap.measure ? snap.measure : null;
    return {
      ...base,
      unit,
      total: unit !== null ? lineTotal(unit, entry.qty) : null,
      mode: measure ? "measure" : "units",
      rules: service ? null : quantityRules(measure ? "measure" : "units", { quantity: measure }),
      note: unit === null ? t("saved.askPrice") : ""
    };
  }

  const { item, optionParam, itemId, redirected } = resolve(entry, data);
  if (!item || shopGone || item.availability === "out_of_stock") {
    return { ...base, status: "unavailable", link: false, chip: chip("bad", t("saved.unavailable")), note: "", qty: entry.qty };
  }
  const sl = savedLine({ entry: { ...entry, optionParam }, item });
  const name = item.name || base.name;
  const image = coverUrl(item) || base.image;
  const href = `/b/${encodeURIComponent(item.businessSlug || entry.businessSlug)}/i/${encodeURIComponent(itemId)}${optionParam ? `?v=${encodeURIComponent(optionParam)}` : ""}`;
  const out = { ...base, name, image, href, service: sl.service, redirected, status: sl.status, qty: sl.qty, total: sl.status === "ok" ? sl.total : null, unit: sl.unit ?? null, mode: sl.info?.mode ?? "units", rules: sl.service ? null : (sl.info?.rules ?? null), optionLabel: sl.option?.state === "ok" ? sl.option.label : entry.optionLabel || "", itemId };

  if (sl.status === "choose_options") {
    return { ...out, optionLabel: "", chip: chip("info", t("saved.chooseOptions")), note: finite(sl.from) ? fill("saved.fromChoose", { price: formatKes(sl.from) }) : t("saved.chooseOptions"), rules: null };
  }
  if (sl.status === "option_gone") return { ...out, chip: chip("bad", t("saved.optionGone")), rules: null };
  if (sl.status === "no_price") return { ...out, note: t("saved.askPrice") };

  // Something worth saying, one chip, in this order: price changed, flash sale, only a few left (the unavailable cases returned above).
  const was = snap.unit;
  const now = sl.unit;
  const flash = Boolean(item.flash);
  let c = null;
  if (flash) c = chip("flash", t("saved.chipFlash"));
  else if (!sl.tiers && finite(was) && finite(now) && now !== was && entry.optionParam === optionParam) {
    c = now < was ? chip("ok", fill("saved.chipLess", { amount: formatKes(was - now) })) : chip("warn", fill("saved.chipMore", { amount: formatKes(now - was) }));
  }
  if (!c && sl.capped) c = chip("warn", fill("saved.chipFew", { n: String(sl.capped) }));
  return { ...out, chip: c };
}

const ts = (e) => (finite(e.updatedAt) ? e.updatedAt : e.savedAt || 0);

/**
 * { groups, count, shops, total, unpriced, mayChange } for the drawer. A shop's box holds its products and services together; boxes are
 * ordered by their newest activity, so the shop the buyer just saved from is on top.
 */
export function buildView(entries, data, { stale = false } = {}) {
  const by = new Map();
  for (const e of entries) {
    if (!by.has(e.businessId)) by.set(e.businessId, []);
    by.get(e.businessId).push(e);
  }
  const groups = [];
  for (const [businessId, list] of by) {
    const shop = data?.shops?.[businessId] ?? null;
    const shopGone = Boolean(data) && !shop && list.every((e) => known(e, data));
    const lines = list.map((e) => lineView(e, data, { shopGone }));
    const first = list[0];
    let subtotal = 0;
    let priced = 0;
    for (const l of lines) if (finite(l.total)) { subtotal += l.total; priced += 1; }
    groups.push({
      businessId,
      slug: shop?.slug || first.businessSlug || "",
      name: shop?.name || first.snap?.businessName || t("saved.notListedShop"),
      shop,
      shopGone,
      lines,
      activity: Math.max(...list.map(ts)),
      subtotal,
      priced,
      unpriced: lines.filter((l) => ["no_price", "choose_options", "option_gone"].includes(l.status)).length
    });
  }
  groups.sort((a, b) => b.activity - a.activity);
  return {
    groups,
    count: entries.length,
    shops: groups.length,
    total: groups.reduce((s, g) => s + g.subtotal, 0),
    unpriced: groups.reduce((s, g) => s + g.unpriced, 0),
    mayChange: stale || !data
  };
}

/** The lines a shop is sent: the ones that exist today (a line that is no longer listed is left out). */
export const sendable = (group) => group.lines.filter((l) => l.status !== "unavailable" && !group.shopGone);
