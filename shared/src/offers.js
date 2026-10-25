// Product offers ("deals"): one engine for every place an offer is created, stored, shown or checked.
//
// An offer belongs to one or more PRODUCTS, never to a whole store. A store card shows an Offer chip because at least one
// of its products has a running offer; a product card shows the chip only when that product is in the offer. The offer
// never rewrites the product's price: the listed price (and any flash sale price) stays the truth on the card, and the
// deal is explained next to it. The database function offer_config_valid() enforces the same shapes as validateOffer();
// a database test keeps the two equal.
import { DAYS, formatKes, nairobiNow } from "./utils.js";

export const OFFER_MAX_ITEMS = 12;
export const OFFER_MAX_DAYS = 365;
export const OFFER_TITLE = [3, 80];
export const OFFER_CHIP = [2, 22];
export const OFFER_TERMS_MAX = 280;
export const OFFER_DESCRIPTION_MAX = 200;
export const OFFER_GIFT = [2, 48];
export const OFFER_CODE = /^[A-Z0-9]{3,16}$/;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DAY_MS = 86_400_000;

export const OFFER_DAYS = DAYS.slice(1).concat(DAYS[0]);
export const OFFER_DAY_NAMES = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND = ["sat", "sun"];

const int = (v) => (Number.isInteger(Number(v)) && String(v ?? "").trim() !== "" ? Number(v) : NaN);
const num = (v) => (String(v ?? "").trim() === "" ? NaN : Number(v));
const money = (v) => formatKes(v);
const clip = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const cleanText = (value, [min, max]) => {
  const clean = String(value ?? "").trim();
  if (!clean) return { ok: true, value: null };
  if (clean.length < min || clean.length > max || CONTROL.test(clean)) return { ok: false };
  return { ok: true, value: clean };
};

// ---- Kinds -------------------------------------------------------------------------------------------------------
// Each kind has: a name for the seller, the fields its form needs, a check of its config, and its wording.
// `needs` says how many products it must be attached to: { min, max } with `with` meaning companion products.

const pct = (v) => Number.isInteger(v) && v >= 1 && v <= 99;

export const OFFER_KINDS = {
  percent_off: {
    name: "Percent off",
    blurb: "Take a percentage off the product.",
    fields: [{ key: "percent", label: "Percent off", type: "number", min: 1, max: 99, suffix: "%", placeholder: "10" }],
    defaults: { percent: 10 },
    check: (c) => (pct(int(c.percent)) ? { percent: int(c.percent) } : null),
    label: (c) => `${c.percent}% off`,
    headline: (c) => `${c.percent}% off`
  },
  amount_off: {
    name: "Amount off",
    blurb: "Take a fixed amount off the product.",
    fields: [{ key: "amount", label: "Amount off", type: "number", min: 1, prefix: "KES", placeholder: "50" }],
    defaults: { amount: 50 },
    check: (c) => (num(c.amount) > 0 && num(c.amount) <= 10_000_000 ? { amount: Math.round(num(c.amount) * 100) / 100 } : null),
    label: (c) => `${money(c.amount)} off`,
    headline: (c) => `${money(c.amount)} off`
  },
  buy_x_get_y: {
    name: "Buy X, get Y",
    blurb: "Buy some, get more free or at a discount. Covers buy 2 get 1 free and buy 10 get the 11th free.",
    fields: [
      { key: "buy", label: "Customer buys", type: "number", min: 1, max: 50, placeholder: "2" },
      { key: "get", label: "Customer gets", type: "number", min: 1, max: 50, placeholder: "1" },
      { key: "discountPercent", label: "Discount on those (100 is free)", type: "number", min: 1, max: 100, suffix: "%", placeholder: "100" }
    ],
    defaults: { buy: 2, get: 1, discountPercent: 100 },
    check: (c) => {
      const buy = int(c.buy);
      const get = int(c.get);
      const d = c.discountPercent === undefined || c.discountPercent === null || c.discountPercent === "" ? 100 : int(c.discountPercent);
      return buy >= 1 && buy <= 50 && get >= 1 && get <= 50 && Number.isInteger(d) && d >= 1 && d <= 100 ? { buy, get, discountPercent: d } : null;
    },
    label: (c) => (c.discountPercent === 100 ? `Buy ${c.buy} Get ${c.get} Free` : `Buy ${c.buy} Get ${c.get} ${c.discountPercent}% off`),
    headline: (c) => (c.discountPercent === 100 ? `Buy ${c.buy}, get ${c.get} free` : `Buy ${c.buy}, get ${c.get} at ${c.discountPercent}% off`)
  },
  multi_buy: {
    name: "Multi-buy price",
    blurb: "A set price for a number of units, like 3 for KES 1,000.",
    fields: [
      { key: "qty", label: "Number of units", type: "number", min: 2, max: 100, placeholder: "3" },
      { key: "price", label: "Price for all of them", type: "number", min: 1, prefix: "KES", placeholder: "1000" }
    ],
    defaults: { qty: 3 },
    check: (c) => (int(c.qty) >= 2 && int(c.qty) <= 100 && num(c.price) > 0 ? { qty: int(c.qty), price: Math.round(num(c.price) * 100) / 100 } : null),
    label: (c) => `${c.qty} for ${money(c.price)}`,
    headline: (c) => `${c.qty} for ${money(c.price)}`
  },
  bundle: {
    name: "Bundle",
    blurb: "Two or more products bought together, for a better price or a free gift. A bottle plus a refill, for example.",
    needs: { min: 1, withMin: 1 },
    fields: [
      { key: "rewardType", label: "Reward", type: "select", options: [["bundle_price", "A bundle price"], ["percent_off", "Percent off the bundle"], ["amount_off", "Amount off the bundle"], ["free_gift", "A free gift"]] },
      { key: "rewardValue", label: "Value", type: "number", min: 1, showFor: ["bundle_price", "percent_off", "amount_off"], placeholder: "250" },
      { key: "gift", label: "Free gift", type: "text", showFor: ["free_gift"], placeholder: "Reusable cap" }
    ],
    defaults: { rewardType: "bundle_price" },
    check: (c) => {
      const type = c.rewardType;
      if (type === "free_gift") {
        const gift = cleanText(c.gift, OFFER_GIFT);
        return gift.ok && gift.value ? { rewardType: type, gift: gift.value } : null;
      }
      const value = num(c.rewardValue);
      if (type === "percent_off") return pct(int(c.rewardValue)) ? { rewardType: type, rewardValue: int(c.rewardValue) } : null;
      if (type === "amount_off" || type === "bundle_price") return value > 0 ? { rewardType: type, rewardValue: Math.round(value * 100) / 100 } : null;
      return null;
    },
    label: (c) =>
      c.rewardType === "bundle_price" ? `Bundle ${money(c.rewardValue)}` : c.rewardType === "percent_off" ? `Bundle ${c.rewardValue}% off` : c.rewardType === "amount_off" ? `Bundle save ${money(c.rewardValue)}` : "Bundle + free gift",
    headline: (c) =>
      c.rewardType === "bundle_price" ? `Together for ${money(c.rewardValue)}` : c.rewardType === "percent_off" ? `${c.rewardValue}% off when bought together` : c.rewardType === "amount_off" ? `Save ${money(c.rewardValue)} when bought together` : `Free ${c.gift} when bought together`
  },
  volume: {
    name: "Buy more, save more",
    blurb: "A bigger discount the more the customer buys.",
    fields: [{ key: "tiers", label: "Tiers", type: "tiers" }],
    defaults: { tiers: [{ qty: 3, percent: 5 }, { qty: 6, percent: 10 }] },
    check: (c) => {
      const raw = Array.isArray(c.tiers) ? c.tiers : [];
      if (raw.length < 1 || raw.length > 4) return null;
      const tiers = raw.map((t) => ({ qty: int(t?.qty), percent: int(t?.percent) }));
      if (!tiers.every((t) => t.qty >= 2 && t.qty <= 1000 && pct(t.percent))) return null;
      for (let i = 1; i < tiers.length; i += 1) if (tiers[i].qty <= tiers[i - 1].qty || tiers[i].percent <= tiers[i - 1].percent) return null;
      return { tiers };
    },
    label: (c) => `Save up to ${c.tiers[c.tiers.length - 1].percent}%`,
    headline: (c) => c.tiers.map((t) => `${t.qty}+ for ${t.percent}% off`).join(", ")
  },
  free_gift: {
    name: "Free gift or perk",
    blurb: "A free extra with the product: free delivery, a free gift, a free fitting.",
    fields: [
      { key: "gift", label: "What they get", type: "text", placeholder: "Free delivery" },
      { key: "minQty", label: "When they buy at least", type: "number", min: 1, max: 1000, optional: true, placeholder: "1" }
    ],
    defaults: { gift: "", minQty: 1 },
    check: (c) => {
      const gift = cleanText(c.gift, OFFER_GIFT);
      if (!gift.ok || !gift.value) return null;
      const out = { gift: gift.value };
      if (c.minQty !== undefined && c.minQty !== null && c.minQty !== "") {
        const q = int(c.minQty);
        if (!(q >= 1 && q <= 1000)) return null;
        if (q > 1) out.minQty = q;
      }
      return out;
    },
    label: (c) => (/^free\b/i.test(c.gift) ? clip(c.gift, 22) : clip(`Free ${c.gift}`, 22)),
    headline: (c) => (/^free\b/i.test(c.gift) ? c.gift : `Free ${c.gift}`) + (c.minQty > 1 ? ` when you buy ${c.minQty} or more` : "")
  }
};

export const OFFER_KIND_KEYS = Object.keys(OFFER_KINDS);
const kindOf = (offer) => OFFER_KINDS[offer?.kind] ?? null;

// ---- Conditions --------------------------------------------------------------------------------------------------

function checkConditions(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const out = {};
  if (c.daysOfWeek !== undefined && c.daysOfWeek !== null) {
    if (!Array.isArray(c.daysOfWeek)) return null;
    const days = OFFER_DAYS.filter((d) => c.daysOfWeek.includes(d));
    if (days.length !== new Set(c.daysOfWeek).size) return null;
    if (days.length > 0 && days.length < 7) out.daysOfWeek = days;
  }
  if (c.hours !== undefined && c.hours !== null) {
    if (typeof c.hours !== "object" || !TIME.test(c.hours.from ?? "") || !TIME.test(c.hours.to ?? "") || c.hours.from === c.hours.to) return null;
    out.hours = { from: c.hours.from, to: c.hours.to };
  }
  if (c.newCustomersOnly) out.newCustomersOnly = true;
  if (c.minSpend !== undefined && c.minSpend !== null && c.minSpend !== "") {
    const spend = num(c.minSpend);
    if (!(spend > 0 && spend <= 10_000_000)) return null;
    out.minSpend = Math.round(spend);
  }
  return out;
}

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const clock12 = (hhmm) => {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m === "00" ? "" : `:${m}`}${h < 12 ? "am" : "pm"}`;
};

export function daysText(days) {
  const set = new Set(days ?? []);
  if (!set.size || set.size === 7) return "";
  if (set.size === 5 && WEEKDAYS.every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && WEEKEND.every((d) => set.has(d))) return "Weekends";
  return OFFER_DAYS.filter((d) => set.has(d)).map((d) => OFFER_DAY_NAMES[d]).join(", ");
}

export const hoursText = (hours) => (hours ? `${clock12(hours.from)} to ${clock12(hours.to)}` : "");

/** The small print as short phrases, in a stable order: when, who, how much. */
export function conditionsText(offer) {
  const c = offer?.conditions ?? {};
  return [
    daysText(c.daysOfWeek),
    hoursText(c.hours),
    c.newCustomersOnly ? "New customers only" : "",
    c.minSpend ? `Spend ${money(c.minSpend)} or more` : ""
  ].filter(Boolean);
}

// ---- Validation --------------------------------------------------------------------------------------------------

const roleOf = (entry) => (entry?.role === "with" ? "with" : "main");

/**
 * Check an offer a seller is saving. `items` are the seller's own products (for prices and ownership).
 * Returns { ok: true, value } with everything trimmed and normalised, or { ok: false, error, field? }.
 */
export function validateOffer(input, { items = [], nowMs = Date.now(), existing = null } = {}) {
  const kind = OFFER_KINDS[input?.kind];
  if (!kind) return { ok: false, error: "invalid_kind", field: "kind" };

  const config = kind.check(input.config ?? {});
  if (!config) return { ok: false, error: "invalid_config", field: "config" };

  const conditions = checkConditions(input.conditions);
  if (!conditions) return { ok: false, error: "invalid_conditions", field: "conditions" };

  const byId = new Map(items.map((i) => [i.id, i]));
  const picked = [];
  for (const entry of input.items ?? (input.itemIds ?? []).map((itemId) => ({ itemId, role: "main" }))) {
    const itemId = entry.itemId ?? entry.id;
    if (!byId.has(itemId)) return { ok: false, error: "item_not_found", field: "items" };
    if (!picked.some((p) => p.itemId === itemId)) picked.push({ itemId, role: roleOf(entry) });
  }
  if (picked.length === 0) return { ok: false, error: "no_items", field: "items" };
  if (picked.length > OFFER_MAX_ITEMS) return { ok: false, error: "too_many_items", field: "items" };
  if (input.kind === "bundle") {
    const mains = picked.filter((p) => p.role === "main").length;
    const withs = picked.length - mains;
    if (mains < 1 || withs < 1) return { ok: false, error: "bundle_needs_two", field: "items" };
  } else {
    for (const p of picked) p.role = "main";
  }

  const start = input.startsAt ? Date.parse(input.startsAt) : nowMs;
  const end = input.endsAt ? Date.parse(input.endsAt) : null;
  if (!Number.isFinite(start) || (end !== null && !Number.isFinite(end))) return { ok: false, error: "invalid_window", field: "endsAt" };
  // An edit may keep a start that has already passed; a new offer may not start in the past.
  const from = existing ? start : Math.max(start, nowMs);
  if (end !== null && end <= nowMs) return { ok: false, error: "ends_in_past", field: "endsAt" };
  if (end !== null && end <= from) return { ok: false, error: "invalid_window", field: "endsAt" };
  if (end !== null && end - from > OFFER_MAX_DAYS * DAY_MS) return { ok: false, error: "duration_too_long", field: "endsAt" };

  const title = cleanText(input.title, OFFER_TITLE);
  if (!title.ok) return { ok: false, error: "invalid_title", field: "title" };
  const chip = cleanText(input.chipText, OFFER_CHIP);
  if (!chip.ok) return { ok: false, error: "invalid_chip_text", field: "chipText" };
  const description = cleanText(input.description, [1, OFFER_DESCRIPTION_MAX]);
  if (!description.ok) return { ok: false, error: "invalid_description", field: "description" };
  const terms = cleanText(input.terms, [1, OFFER_TERMS_MAX]);
  if (!terms.ok) return { ok: false, error: "invalid_terms", field: "terms" };
  const code = String(input.code ?? "").trim().toUpperCase();
  if (code && !OFFER_CODE.test(code)) return { ok: false, error: "invalid_code", field: "code" };

  const offer = {
    kind: input.kind,
    config,
    conditions,
    items: picked,
    startsAt: new Date(from).toISOString(),
    endsAt: end === null ? null : new Date(end).toISOString(),
    chipText: chip.value,
    description: description.value,
    terms: terms.value,
    code: code || null
  };
  offer.title = title.value ?? clip(offerHeadline(offer), OFFER_TITLE[1]);

  // A deal that costs the customer more than buying normally is a mistake, so refuse it when the prices are known.
  const worse = dealProblem(offer, picked.map((p) => ({ ...byId.get(p.itemId), role: p.role })));
  if (worse) return { ok: false, error: worse, field: "config" };
  return { ok: true, value: offer };
}

function dealProblem(offer, products) {
  const priced = (p) => Number.isFinite(Number(p.price)) && Number(p.price) > 0 && ["fixed", "from"].includes(p.priceType ?? "fixed");
  const c = offer.config;
  if (offer.kind === "amount_off") {
    const cheapest = products.filter(priced).map((p) => Number(p.price));
    if (cheapest.length && c.amount >= Math.min(...cheapest)) return "discount_too_large";
  }
  if (offer.kind === "multi_buy") {
    const ps = products.filter(priced);
    if (ps.length && ps.some((p) => c.price >= Number(p.price) * c.qty)) return "deal_not_cheaper";
  }
  if (offer.kind === "bundle" && ["bundle_price", "amount_off"].includes(c.rewardType) && products.every(priced)) {
    const total = products.reduce((sum, p) => sum + Number(p.price), 0);
    if (c.rewardType === "bundle_price" && c.rewardValue >= total) return "deal_not_cheaper";
    if (c.rewardType === "amount_off" && c.rewardValue >= total) return "discount_too_large";
  }
  return null;
}

// ---- Wording -----------------------------------------------------------------------------------------------------

/** The short line for a chip. A seller's own chip text wins when there is one. */
export function offerLabel(offer, { plain = false } = {}) {
  if (!plain && offer?.chipText) return offer.chipText;
  const kind = kindOf(offer);
  if (!kind || !offer.config) return "Offer";
  try {
    return clip(kind.label(offer.config), 28);
  } catch {
    return "Offer";
  }
}

/** One sentence about the deal itself, the same for everyone. */
export function offerHeadline(offer) {
  const kind = kindOf(offer);
  if (!kind || !offer.config) return "Special offer";
  try {
    return kind.headline(offer.config);
  } catch {
    return "Special offer";
  }
}

const unitWord = (n) => (n === 1 ? "one" : String(n));

/** "How it works" in plain steps, with the maths when the product prices are known. */
export function offerSteps(offer, { products = [] } = {}) {
  const c = offer?.config ?? {};
  const steps = [];
  if (offer?.kind === "buy_x_get_y") {
    steps.push(`Add ${unitWord(c.buy)} to your order.`);
    steps.push(c.discountPercent === 100 ? `Get ${unitWord(c.get)} more free.` : `Get ${unitWord(c.get)} more at ${c.discountPercent}% off.`);
  } else if (offer?.kind === "multi_buy") {
    steps.push(`Buy ${c.qty} together.`);
    steps.push(`Pay ${money(c.price)} for all ${c.qty}.`);
  } else if (offer?.kind === "bundle") {
    const mains = products.filter((p) => p.role !== "with").map((p) => p.name);
    const withs = products.filter((p) => p.role === "with").map((p) => p.name);
    steps.push(`Buy ${mains.join(" and ") || "the main item"} together with ${withs.join(" and ") || "the other item"}.`);
    steps.push(c.rewardType === "free_gift" ? `Get a free ${c.gift}.` : c.rewardType === "bundle_price" ? `Pay ${money(c.rewardValue)} for the set.` : c.rewardType === "percent_off" ? `Get ${c.rewardValue}% off the set.` : `Get ${money(c.rewardValue)} off the set.`);
  } else if (offer?.kind === "volume") {
    for (const t of c.tiers ?? []) steps.push(`Buy ${t.qty} or more, get ${t.percent}% off.`);
  } else if (offer?.kind === "free_gift") {
    steps.push(c.minQty > 1 ? `Buy ${c.minQty} or more.` : "Buy this product.");
    steps.push(`${/^free\b/i.test(c.gift) ? c.gift : `Free ${c.gift}`} is included.`);
  } else if (offer?.kind === "percent_off") {
    steps.push(`Get ${c.percent}% off the listed price.`);
  } else if (offer?.kind === "amount_off") {
    steps.push(`Get ${money(c.amount)} off the listed price.`);
  }
  if (offer?.code) steps.push(`Tell the seller the code ${offer.code}.`);
  else steps.push("Mention this offer when you chat with the seller.");
  return steps;
}

// ---- Savings -----------------------------------------------------------------------------------------------------

const priceOf = (p) => (p && Number.isFinite(Number(p.price)) && Number(p.price) > 0 ? Number(p.price) : null);

/**
 * What the deal is worth on real prices. Never used to change a product's own price: it is only shown beside it.
 * Returns null when the maths needs a price that is missing, or { units, regular, pay, save, text } otherwise.
 * `price` is the product's current price (a flash sale price counts); `companions` are the other bundle products.
 */
export function offerSavings(offer, { price, companions = [] } = {}) {
  const p = Number(price);
  const c = offer?.config ?? {};
  const out = (units, regular, pay, text) => {
    const save = Math.max(0, Math.round(regular - pay));
    // A deal that would make the product free is a mistake in the offer, not a saving to advertise.
    return save > 0 && Math.round(pay) > 0 ? { units, regular: Math.round(regular), pay: Math.round(pay), save, text } : null;
  };
  switch (offer?.kind) {
    case "percent_off":
      return p > 0 ? out(1, p, p * (1 - c.percent / 100), `Pay ${money(Math.round(p * (1 - c.percent / 100)))} instead of ${money(p)}`) : null;
    case "amount_off":
      return p > 0 ? out(1, p, Math.max(0, p - c.amount), `Pay ${money(Math.max(0, p - c.amount))} instead of ${money(p)}`) : null;
    case "buy_x_get_y": {
      if (!(p > 0)) return null;
      const units = c.buy + c.get;
      const regular = p * units;
      const pay = p * c.buy + p * c.get * (1 - c.discountPercent / 100);
      return out(units, regular, pay, `Pay ${money(Math.round(pay))} for ${units} instead of ${money(Math.round(regular))}`);
    }
    case "multi_buy":
      return p > 0 ? out(c.qty, p * c.qty, c.price, `Pay ${money(c.price)} for ${c.qty} instead of ${money(Math.round(p * c.qty))}`) : null;
    case "bundle": {
      const prices = [p, ...companions.map(priceOf)];
      if (!prices.every((x) => x > 0)) return null;
      const total = prices.reduce((a, b) => a + b, 0);
      if (c.rewardType === "free_gift") return null;
      const pay = c.rewardType === "bundle_price" ? c.rewardValue : c.rewardType === "percent_off" ? total * (1 - c.rewardValue / 100) : Math.max(0, total - c.rewardValue);
      return out(prices.length, total, pay, `Pay ${money(Math.round(pay))} for the set instead of ${money(Math.round(total))}`);
    }
    case "volume": {
      if (!(p > 0)) return null;
      const top = c.tiers[c.tiers.length - 1];
      const each = p * (1 - top.percent / 100);
      return out(top.qty, p * top.qty, each * top.qty, `${top.qty}+ at ${money(Math.round(each))} each instead of ${money(p)}`);
    }
    default:
      return null;
  }
}

// ---- Time --------------------------------------------------------------------------------------------------------

/** paused | scheduled | live | ended. A paused offer is one the seller switched off; the window can still be open. */
export function offerPhase(offer, nowMs = Date.now()) {
  const ends = offer?.endsAt ? Date.parse(offer.endsAt) : null;
  const starts = offer?.startsAt ? Date.parse(offer.startsAt) : null;
  if (offer?.status === "ended" || offer?.status === "expired" || (ends !== null && ends <= nowMs)) return "ended";
  if (offer?.active === false || offer?.status === "paused") return "paused";
  if (starts !== null && starts > nowMs) return "scheduled";
  return "live";
}

/** Whether the day and hour limits (happy hour, weekends) allow it at this moment. Nairobi time. */
export function offerAvailableNow(offer, nowMs = Date.now()) {
  const c = offer?.conditions ?? {};
  const { day, minutes } = nairobiNow(new Date(nowMs));
  if (c.daysOfWeek?.length && !c.daysOfWeek.includes(day)) return false;
  if (c.hours) {
    const from = minutesOf(c.hours.from);
    const to = minutesOf(c.hours.to);
    return to > from ? minutes >= from && minutes < to : minutes >= from || minutes < to;
  }
  return true;
}

/** Milliseconds left in the window, or null for an offer with no end. */
export const offerRemainingMs = (offer, nowMs = Date.now()) => (offer?.endsAt ? Math.max(0, Date.parse(offer.endsAt) - nowMs) : null);

// ---- Which offers show, and where --------------------------------------------------------------------------------

const endsSooner = (a, b) => (a.endsAt ? Date.parse(a.endsAt) : Infinity) - (b.endsAt ? Date.parse(b.endsAt) : Infinity);

/** Offers that are showing to customers right now, soonest to end first. */
export const liveOffers = (offers, nowMs = Date.now()) =>
  (offers ?? []).filter((o) => offerPhase(o, nowMs) === "live").sort((a, b) => endsSooner(a, b) || Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0));

/** What a card needs: the offer to name on the chip, how many more there are, and the list. */
export function chipOf(offers, nowMs = Date.now()) {
  const list = liveOffers(offers, nowMs);
  if (!list.length) return null;
  return { top: list[0], label: offerLabel(list[0]), extra: list.length - 1, offers: list };
}

/** itemId -> offers that include it. */
export function offersByItem(offers) {
  const map = new Map();
  for (const offer of offers ?? []) {
    for (const entry of offer.items ?? (offer.itemIds ?? []).map((itemId) => ({ itemId }))) {
      const id = entry.itemId ?? entry.id;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(offer);
    }
  }
  return map;
}

/** How many of a business's products have a running offer: the number the store card's Offer chip stands for. */
export function offerProductCount(offers, nowMs = Date.now()) {
  const ids = new Set();
  for (const offer of liveOffers(offers, nowMs)) for (const entry of offer.items ?? (offer.itemIds ?? []).map((itemId) => ({ itemId }))) ids.add(entry.itemId ?? entry.id);
  return ids.size;
}

/** The plan allows this many offers switched on at once (null is unlimited). Ended and paused offers do not count. */
export function offerQuota(offers, limits, nowMs = Date.now()) {
  const limit = limits?.activeOffers ?? null;
  const used = (offers ?? []).filter((o) => ["live", "scheduled"].includes(offerPhase(o, nowMs))).length;
  return { limit, used, canCreate: limit === null || used < limit };
}

/** The message a customer sends the seller to claim a deal. */
export function offerClaimMessage(offer, itemName) {
  const code = offer?.code ? ` (code ${offer.code})` : "";
  return `Hi, I saw the offer "${offerLabel(offer, { plain: true })}" on ${itemName}${code} on EpicMKT. I would like to claim it.`;
}

// ---- The shape a page shows ------------------------------------------------------------------------------------

/**
 * One offer as a customer-facing "deal": everything a card, the store page or the product page prints, already worded.
 * `products` are { id, name, imageUrl, price, role } for the products the offer is on that customers can see.
 */
export function dealOf(offer, products = [], nowMs = Date.now()) {
  return {
    id: offer.id,
    kind: offer.kind,
    config: offer.config,
    title: offer.title ?? offerHeadline(offer),
    label: offerLabel(offer),
    plainLabel: offerLabel(offer, { plain: true }),
    headline: offerHeadline(offer),
    description: offer.description ?? null,
    code: offer.code ?? null,
    terms: offer.terms ?? null,
    startsAt: offer.startsAt ?? null,
    endsAt: offer.endsAt ?? null,
    remainingMs: offerRemainingMs(offer, nowMs),
    conditions: conditionsText(offer),
    availableNow: offerAvailableNow(offer, nowMs),
    products
  };
}

// ---- Recipes -----------------------------------------------------------------------------------------------------
// One tap in the seller's builder fills in a whole offer. Anything left out (a price, usually) is what the seller still
// has to decide. `icon` names a Font Awesome icon the seller screen maps; `example` is shown on the recipe.

export const OFFER_RECIPES = [
  { key: "buy2get1", title: "Buy 2, get 1 free", blurb: "Move more stock per order.", example: "Buy 2 bottles of juice, get a third free", icon: "gift", kind: "buy_x_get_y", config: { buy: 2, get: 1, discountPercent: 100 } },
  { key: "bogo_half", title: "Buy 1, get 1 half price", blurb: "A gentler way to double the basket.", example: "Second pair of socks at half price", icon: "clone", kind: "buy_x_get_y", config: { buy: 1, get: 1, discountPercent: 50 } },
  { key: "loyalty11", title: "Buy 10, get the 11th free", blurb: "Rewards the customers who keep coming back.", example: "Buy 10 refills of 20L water, the 11th is free", icon: "medal", kind: "buy_x_get_y", config: { buy: 10, get: 1, discountPercent: 100 } },
  { key: "multi3", title: "3 for a set price", blurb: "A round price is easy to say and remember.", example: "3 loaves for KES 200", icon: "layer-group", kind: "multi_buy", config: { qty: 3 }, needs: ["price"] },
  { key: "bottle_refill", title: "Bottle + refill combo", blurb: "Pair a product with its refill or its partner and price the pair.", example: "New 20L bottle plus first refill for KES 450", icon: "puzzle-piece", kind: "bundle", config: { rewardType: "bundle_price" }, needs: ["rewardValue", "companion"] },
  { key: "bundle_gift", title: "Buy together, get a gift", blurb: "Reward the pair with something small.", example: "Buy a phone and a case, get a screen guard free", icon: "box-open", kind: "bundle", config: { rewardType: "free_gift" }, needs: ["gift", "companion"] },
  { key: "free_delivery", title: "Free delivery", blurb: "Remove the thing that stops people ordering.", example: "Free delivery on 5 or more", icon: "truck-fast", kind: "free_gift", config: { gift: "Free delivery", minQty: 1 } },
  { key: "free_gift", title: "Free gift with purchase", blurb: "Add something that costs you little and feels generous.", example: "Free cupcake with every cake", icon: "heart", kind: "free_gift", config: { gift: "", minQty: 1 }, needs: ["gift"] },
  { key: "happy_hour", title: "Happy hour", blurb: "Fill your quiet hours.", example: "20% off from 4pm to 6pm, weekdays", icon: "clock", kind: "percent_off", config: { percent: 20 }, conditions: { daysOfWeek: ["mon", "tue", "wed", "thu", "fri"], hours: { from: "16:00", to: "18:00" } }, chipText: "Happy hour" },
  { key: "weekend", title: "Weekend special", blurb: "Bring people in when you want them.", example: "KES 100 off on Saturday and Sunday", icon: "calendar-day", kind: "amount_off", config: { amount: 100 }, conditions: { daysOfWeek: ["sat", "sun"] }, chipText: "Weekend deal" },
  { key: "student", title: "Student discount", blurb: "Show a student ID, get the discount.", example: "15% off with a student ID", icon: "graduation-cap", kind: "percent_off", config: { percent: 15 }, code: "STUDENT", chipText: "Student deal", terms: "Show a valid student ID." },
  { key: "welcome", title: "Welcome deal", blurb: "Win a first order.", example: "10% off your first order", icon: "hand-holding-heart", kind: "percent_off", config: { percent: 10 }, conditions: { newCustomersOnly: true }, chipText: "Welcome deal" },
  { key: "volume", title: "Buy more, save more", blurb: "Bigger baskets, bigger savings.", example: "3+ get 5% off, 6+ get 10% off", icon: "arrow-trend-up", kind: "volume", config: { tiers: [{ qty: 3, percent: 5 }, { qty: 6, percent: 10 }] } },
  { key: "clearance", title: "Clearance", blurb: "Clear what is not moving.", example: "30% off while stock lasts", icon: "tags", kind: "percent_off", config: { percent: 30 }, chipText: "Clearance" }
];

export const offerRecipe = (key) => OFFER_RECIPES.find((r) => r.key === key) ?? null;
