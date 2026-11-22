// Reads what a shopper meant from what they typed. A search box is used by people who type "iphon", by people who type "where can
// i find a cheap plumber near me", and by people who type `"samsung a15" -case under 25k`. This turns all of them into the words to
// match plus the things around the words: a price window, a sort, a condition, a place, delivery.
//
//   understandQuery('cheap used iphone 11 in kisumu under 20k')
//     -> { text: "iphone 11", max: 20000, sort: "price_asc", conditions: ["used"], places: ["kisumu"], chips: [...] }
//
// Pure and synchronous: the browser, the edge function and the tests all run it. Nothing here guesses at spelling (that needs the
// catalogue's own words; see search.js); it only separates words from intent. Every piece it takes out is reported as a `chip`
// with the query as it would read without that piece (`without`), so the page can show "Under KES 20,000 ×" and the shopper can
// undo a guess with one tap.

import { normalizeText } from "../utils.js";

// Towns and areas shoppers name. The catalogue's own towns and counties are added on top (see placePhrases).
export const STATIC_PLACES = [
  "nairobi", "mombasa", "kisumu", "nakuru", "eldoret", "thika", "kakamega", "kisii", "nyeri", "machakos", "kitale", "kericho", "bungoma", "busia",
  "migori", "homa bay", "siaya", "vihiga", "naivasha", "malindi", "embu", "meru", "nanyuki", "garissa", "kitui", "narok", "ruiru", "kikuyu", "limuru",
  "kiambu", "ngong", "rongai", "kitengela", "athi river", "juja", "westlands", "kilimani", "langata", "kasarani", "embakasi", "githurai",
  "kahawa", "roysambu", "lavington", "parklands", "eastleigh", "kayole", "umoja", "donholm", "buruburu", "south b", "south c", "ngara", "kawangware",
  "dagoretti", "rongai", "syokimau", "mlolongo", "ongata rongai", "nyali", "diani", "likoni", "mtwapa", "kilifi", "lamu", "voi", "wote",
  "maseno", "ahero", "kisumu cbd", "mumias", "webuye", "malaba", "lodwar", "maralal", "isiolo", "marsabit", "wajir", "mandera", "nyahururu",
  "murang'a", "muranga", "karatina", "chuka", "kerugoya", "kutus", "sagana", "gilgil", "molo", "njoro", "bomet", "sotik", "kapsabet", "iten", "ugunja",
  "bondo", "kendu bay", "oyugis", "rongo", "awendo", "kehancha", "ukunda", "kwale", "taveta", "mwingi", "makueni", "emali", "kajiado", "magadi"
];
const GENERIC_PLACE_WORDS = new Set(["cbd", "town", "road", "street", "estate", "plaza", "market", "stage", "junction", "centre", "center", "mall", "building", "avenue", "highway", "area", "city", "county", "shopping", "complex", "stage", "street", "lane"]);

/** The place phrases a query may name: the static list plus the catalogue's towns and counties, longest first. */
export function placePhrases(extra = []) {
  const out = new Set(STATIC_PLACES.map(normalizeText));
  for (const raw of extra) {
    const full = normalizeText(raw);
    if (!full) continue;
    out.add(full);
    const parts = full.split(" ").filter((w) => !GENERIC_PLACE_WORDS.has(w));
    if (parts.length > 1) {
      if (parts[0].length >= 4) out.add(parts[0]);
      const last = parts[parts.length - 1];
      if (last.length >= 5) out.add(last);
    }
  }
  return [...out].filter((p) => p.length >= 3).sort((a, b) => b.length - a.length || a.localeCompare(b));
}

// Words that carry no meaning for finding a thing: how people phrase a request, in English and in Swahili. They are removed only
// when something else remains, so a search for just "best" still searches.
const FILLER = new Set([
  "me", "my", "mine", "we", "us", "our", "you", "your", "need", "needs", "needed", "want", "wants", "wanna", "looking", "look", "searching", "search", "find", "finding",
  "show", "get", "getting", "buy", "buying", "purchase", "ordering", "where", "wheres", "can", "could", "would", "should", "will", "how", "much", "many", "what", "whats", "which",
  "who", "whom", "is", "are", "was", "be", "am", "do", "does", "did", "have", "has", "had", "there", "any", "some", "anyone", "anybody", "someone", "somebody", "something", "anything",
  "the", "a", "an", "of", "to", "in", "on", "at", "for", "with", "and", "or", "that", "this", "these", "those", "it", "its", "if", "so", "then", "than", "from", "by", "as",
  "near", "nearby", "around", "within", "please", "pls", "plz", "kindly", "thanks", "thank", "available", "availability", "sell", "sells", "selling", "instock",
  "price", "prices", "pricing", "cost", "costs", "fee", "fees", "quote", "quotation", "how-much",
  "best", "good", "great", "nice", "quality", "reliable", "trusted", "popular", "recommended", "trending", "ideal", "perfect", "decent", "affordable",
  "shop", "shops", "store", "stores", "kenya", "ke", "local", "online", "now", "today", "urgent", "urgently", "asap", "fast", "quick", "quickly",
  "nataka", "naomba", "naitaji", "ninahitaji", "nahitaji", "tafuta", "nipe", "nipate", "natafuta", "iko", "wapi", "bei", "ya", "za", "wa", "la", "kwa", "na", "yangu", "yako", "hapa", "karibu",
  "ni", "kuna", "ipo", "zipo", "naweza", "pata", "kupata"
]);

const UNITS = "kgs?|g|gms?|grams?|l|ltrs?|litres?|liters?|ml|mls|gb|tb|mb|inch|inches|in|w|watts?|mah|cc|hp|v|m|cm|mm|ft|seaters?|pcs|pieces?|bedrooms?|br|years?|yrs?|months?|days?|hours?|hrs?|mins?|minutes?|people|guests?|persons?|pax|x|cameras?|mp|hz|percent";
const unitAfter = new RegExp(`^\\s*(?:${UNITS})(?![a-z])`);
const RESOLUTION_AFTER = /^\s*(?:tv|tvs|monitor|monitors|screen|display|camera|cameras|video|resolution|ultra|uhd|projector|hdmi|gaming|cable|hd)\b/;

// One amount: an optional currency before, digits (commas allowed), an optional k, an optional currency after.
const NUM = String.raw`((?:ksh?s?|kes|shs?|bob)\.?\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s?(k|thousand)(?![a-z]))?(\s*(?:/=|/-|ksh?s?(?![a-z])|kes(?![a-z])|shs?(?![a-z])|bob(?![a-z])|shillings?(?![a-z])))?`;
const MAX_WORDS = String.raw`(?:under|below|beneath|less than|lower than|cheaper than|not more than|not above|not over|no more than|not exceeding|up to|upto|within|at most|maximum|max|budget of|budget|<=?|≤)`;
const MIN_WORDS = String.raw`(?:over|above|more than|at least|minimum|min|starting at|starting from|from|greater than|not less than|>=?|≥)`;
const AROUND_WORDS = String.raw`(?:around|about|approx\.?|approximately|roughly|~|near|close to)`;

const RE_RANGE = new RegExp(String.raw`(?:between\s+|from\s+)?${NUM}\s*(?:and|to|-|–)\s*${NUM}`, "g");
const RE_MAX = new RegExp(String.raw`(?<![a-z])${MAX_WORDS}\s*${NUM}`, "g");
const RE_MIN = new RegExp(String.raw`(?<![a-z])${MIN_WORDS}\s*${NUM}`, "g");
const RE_AROUND = new RegExp(String.raw`(?<![a-z])${AROUND_WORDS}\s*${NUM}`, "g");
const RE_MARKED = new RegExp(String.raw`(?<![a-z0-9.,])${NUM}(?![a-z0-9])`, "g");
const RE_PLAIN = /(?<![a-z0-9.,/-])(\d{1,3}(?:,\d{3})+|\d{3,8})(?![a-z0-9.,/])/g;

const kes = (n) => `KES ${Number(n).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
const valueOf = (amount, k) => Number(String(amount).replace(/,/g, "")) * (k ? 1000 : 1);
const isYear = (n) => Number.isInteger(n) && n >= 1950 && n <= 2035;

const SORT_PHRASES = [
  [/\b(?:most expensive|highest price|highest priced|priciest|price high to low)\b/g, "price_desc", "Highest price first"],
  [/\b(?:cheapest|cheaper|cheap|inexpensive|low(?:est)? (?:price|cost)|pocket[- ]friendly|budget[- ]friendly|bei (?:nafuu|poa|chini)|nafuu|price low to high|bargain|bargains)\b/g, "price_asc", "Lowest price first"],
  [/\b(?:latest|newest|new arrivals?|just in|recently added|most recent)\b/g, "newest", "Newest first"]
];
const CONDITION_PHRASES = [
  [/\bbrand[- ]new\b/g, "new", "New"],
  [/\b(?:second[- ]?hand|pre[- ]?owned|used|mtumba|mitumba|thrift)\b/g, "used", "Used"],
  [/\b(?:refurbished|refurb|renewed|ex[- ]?uk|ex[- ]?japan|ex[- ]?dubai)\b/g, "refurbished", "Refurbished"]
];
const DEAL_PHRASES = [
  [/\bflash sales?\b/g, "flash", "Flash sale"],
  [/\b(?:on sale|on discount|discounted|with discount|discounts?|deals?|clearance|reduced|punguzo)\b/g, "sale", "On sale"],
  [/\b(?:on offer|offers?|promo(?:tion)?s?)\b/g, "offer", "Shop offers"],
  [/\b(?:wholesale|bulk|jumla)\b/g, "bulk", "Wholesale and bulk"]
];

const collapse = (s) => s.replace(/\s+/g, " ").trim();

/**
 * @param {string} raw what was typed
 * @param {{ places?: string[], modelNumbers?: Set<string> }} [context] `places`: placePhrases(); `modelNumbers`: numbers that appear as
 *   words in product names ("1100" in "Nokia 1100"), which are never read as prices.
 */
export function understandQuery(raw, { places = placePhrases(), modelNumbers = new Set() } = {}) {
  const original = String(raw ?? "").slice(0, 200);
  const state = { s: original.toLowerCase().replace(/[“”‘’`´]/g, (c) => (c === "’" || c === "‘" || c === "`" || c === "´" ? "'" : '"')), chips: [] };
  const out = {
    text: "", groups: [], exact: [], exclude: [], min: null, max: null, sort: null, conditions: [], deals: [], delivery: false, freeDelivery: false,
    store: [], places: [], nearMe: false, chips: []
  };
  const blank = (from, to) => {
    state.s = state.s.slice(0, from) + " ".repeat(to - from) + state.s.slice(to);
  };
  const chip = (id, label, from, to) => {
    const without = collapse(original.slice(0, from) + " " + original.slice(to));
    if (!out.chips.some((c) => c.id === id && c.label === label)) out.chips.push({ id, label, without });
  };
  // Runs a pattern over what is left of the query; `take` returns a chip-less true to consume the match.
  const scan = (re, take) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(state.s)) !== null) {
      if (!m[0]) {
        re.lastIndex += 1;
        continue;
      }
      const start = m.index;
      const end = start + m[0].length;
      if (take(m, start, end)) {
        blank(start, end);
        re.lastIndex = end;
      }
    }
  };

  // 1. Pro operators first, so what is inside quotes is never read as anything else.
  scan(/"([^"]{1,80})"/g, (m, from, to) => {
    const words = normalizeText(m[1]).split(" ").filter(Boolean);
    if (!words.length) return false;
    out.exact.push(...words);
    chip("exact", `Exactly "${words.join(" ")}"`, from, to);
    return true;
  });
  scan(/(?<![a-z0-9])-([a-z][a-z0-9']{1,30})(?![a-z0-9'])/g, (m, from, to) => {
    const word = normalizeText(m[1]);
    if (!word) return false;
    out.exclude.push(word);
    chip("exclude", `Without ${word}`, from, to);
    return true;
  });

  // 2. Money.
  const amountOf = (curPre, amount, k, curPost) => {
    const value = valueOf(amount, k);
    return { value, marked: Boolean(curPre || k || curPost) };
  };
  const guard = (end, marked, value, hasKeyword = true) => {
    if (!marked && unitAfter.test(state.s.slice(end))) return false;       // "under 5 kg", "5 seater": a size, not a price
    if (!marked && value < 20 && hasKeyword) return false;                 // "under 5": too small to be a price
    return Number.isFinite(value);
  };
  const setMax = (n, from, to) => {
    out.max = out.max === null ? n : Math.min(out.max, n);
    chip("price", `Up to ${kes(n)}`, from, to);
  };
  const setMin = (n, from, to) => {
    out.min = out.min === null ? n : Math.max(out.min, n);
    chip("price", `From ${kes(n)}`, from, to);
  };
  scan(RE_RANGE, (m, from, to) => {
    const a = amountOf(m[1], m[2], m[3], m[4]);
    const b = amountOf(m[5], m[6], m[7], m[8]);
    const big = (x) => x.marked || x.value >= 100;
    if (!big(a) || !big(b) || (isYear(a.value) && isYear(b.value))) return false;
    if (!b.marked && unitAfter.test(state.s.slice(to))) return false;
    if (!a.marked && !b.marked && modelNumbers.has(String(m[2])) ) return false;
    const [lo, hi] = a.value <= b.value ? [a.value, b.value] : [b.value, a.value];
    out.min = out.min === null ? lo : Math.max(out.min, lo);
    out.max = out.max === null ? hi : Math.min(out.max, hi);
    chip("price", `${kes(lo)} to ${kes(hi)}`, from, to);
    return true;
  });
  scan(RE_MAX, (m, from, to) => {
    const a = amountOf(m[1], m[2], m[3], m[4]);
    if (!guard(to, a.marked, a.value)) return false;
    setMax(a.value, from, to);
    return true;
  });
  scan(RE_MIN, (m, from, to) => {
    const a = amountOf(m[1], m[2], m[3], m[4]);
    if (!guard(to, a.marked, a.value)) return false;
    setMin(a.value, from, to);
    return true;
  });
  scan(RE_AROUND, (m, from, to) => {
    const a = amountOf(m[1], m[2], m[3], m[4]);
    if (!guard(to, a.marked, a.value) || a.value < 100) return false;
    const lo = Math.round(a.value * 0.8);
    const hi = Math.round(a.value * 1.2);
    out.min = out.min === null ? lo : Math.max(out.min, lo);
    out.max = out.max === null ? hi : Math.min(out.max, hi);
    chip("price", `About ${kes(a.value)}`, from, to);
    return true;
  });
  // An amount with a currency or a k and no word before it: "ksh 500", "20k", "1,500/=". Read as a budget.
  scan(RE_MARKED, (m, from, to) => {
    const a = amountOf(m[1], m[2], m[3], m[4]);
    if (!a.marked || !Number.isFinite(a.value) || a.value < 10) return false;
    if (m[3] && RESOLUTION_AFTER.test(state.s.slice(to)) && [2, 4, 5, 6, 8].includes(Number(m[2]))) return false;   // "4k tv"
    if (!m[1] && !m[4] && m[3] && Number(m[2]) < 10 && !/^\s*$/.test(state.s.slice(to)) && /^\s*(?:tv|tvs|monitor|screen)\b/.test(state.s.slice(to))) return false;
    if (unitAfter.test(state.s.slice(to)) && !m[1] && !m[4]) return false;
    setMax(a.value, from, to);
    return true;
  });
  // A plain number nobody wrote as a model ("phone 20000"): a budget. Years and numbers that are words in product names stay words.
  scan(RE_PLAIN, (m, from, to) => {
    const digits = m[1].replace(/,/g, "");
    const value = Number(digits);
    if (value < 100 || isYear(value) || modelNumbers.has(digits) || unitAfter.test(state.s.slice(to))) return false;
    setMax(value, from, to);
    return true;
  });

  // 3. Phrases that are filters, not words.
  const phrases = (list, apply) => {
    for (const [re, id, label] of list) {
      scan(re, (m, from, to) => {
        apply(id);
        chip(id === "price_asc" || id === "price_desc" || id === "newest" ? "sort" : list === CONDITION_PHRASES ? "condition" : "deals", label, from, to);
        return true;
      });
    }
  };
  phrases(SORT_PHRASES, (id) => {
    out.sort ??= id;
  });
  phrases(CONDITION_PHRASES, (id) => {
    if (!out.conditions.includes(id)) out.conditions.push(id);
  });
  phrases(DEAL_PHRASES, (id) => {
    if (!out.deals.includes(id)) out.deals.push(id);
  });
  scan(/\bfree delivery\b/g, (m, from, to) => {
    out.delivery = true;
    out.freeDelivery = true;
    chip("delivery", "Free delivery", from, to);
    return true;
  });
  scan(/\b(?:(?:with|home|that|which|who|can|will|we)\s+deliver(?:y|ed|s)?|deliver(?:y|ed)\s+(?:to me|available)|delivered|deliver to me)\b/g, (m, from, to) => {
    out.delivery = true;
    chip("delivery", "Delivery", from, to);
    return true;
  });
  scan(/\bopen now\b/g, (m, from, to) => {
    out.store.push("open");
    chip("store", "Open now", from, to);
    return true;
  });
  scan(/(?:\bopen 24 ?(?:hours?|hrs?)\b|\b24\/7\b|\b24 hours? (?=shop|store|pharmacy|chemist|clinic|pub|service))/g, (m, from, to) => {
    out.store.push("open24");
    chip("store", "Open 24 hours", from, to);
    return true;
  });
  scan(/\bverified\b/g, (m, from, to) => {
    out.store.push("verified");
    chip("store", "Verified shops", from, to);
    return true;
  });
  scan(/\b(?:near me|nearby|close to me|around me|closest|nearest|karibu nami|karibu na mimi)\b/g, (m, from, to) => {
    out.nearMe = true;
    chip("nearMe", "Near you", from, to);
    return true;
  });

  // 4. A place: "in Kisumu", "Kisumu plumber", "near Westlands".
  if (places.length) {
    const alternation = places.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|");
    const re = new RegExp(String.raw`(?:(?<![a-z])(?:in|at|near|around|within|from|along|kwa|karibu na)\s+)?(?<![a-z0-9])(${alternation})(?![a-z0-9])`, "g");
    scan(re, (m, from, to) => {
      const place = normalizeText(m[1]);
      if (!out.places.includes(place)) out.places.push(place);
      chip("place", `In ${m[1].replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bCbd\b/, "CBD")}`, from, to);
      return true;
    });
  }

  // "shoes size 42", "size 38": the number is the size; the word adds nothing.
  scan(/\bsizes?\s+(?=\d)/g, () => true);

  // 5. What is left are the words. Alternatives ("a or b") become groups; filler goes only if something real remains.
  const words = (s) => (s.match(/[a-z0-9][a-z0-9'.&/+-]*/g) ?? []).map((w) => w.replace(/[.'-]+$/g, "")).filter(Boolean);
  const groupsOf = (s) => s.split(/\s(?:or|\|)\s|\s*\|\s*/).map(words).filter((g) => g.length);
  // "i" is filler only in "i need ...", "i want ..."; in "i phone" it is half of a name.
  const LEAD = new Set(["need", "want", "am", "m", "would", "wanna", "looking", "wish", "have", "d", "ll", "can", "will", "must", "gotta"]);
  const rawGroups = groupsOf(state.s).map((g) => g.filter((w, i) => !(w === "i" && (LEAD.has(g[i + 1] ?? "") || FILLER.has(g[i + 1] ?? "") || FILLER.has(g[i - 1] ?? "")))));
  // "samsung or tecno phone": the last group's own words after its first are shared by every alternative.
  if (rawGroups.length > 1 && rawGroups.slice(0, -1).every((g) => g.length === 1) && rawGroups[rawGroups.length - 1].length > 1) {
    const tail = rawGroups[rawGroups.length - 1].slice(1);
    for (let i = 0; i < rawGroups.length - 1; i += 1) rawGroups[i] = [...rawGroups[i], ...tail];
  }
  // Filler is only dropped when something real remains in the whole query; a query that is all filler ("best", "near me") has no
  // words at all and so lists everything, in the order its other parts ask for.
  const anyContent = rawGroups.some((g) => g.some((w) => !FILLER.has(w)));
  out.groups = anyContent ? rawGroups.map((g) => g.filter((w) => !FILLER.has(w))).filter((g) => g.length).map((g) => g.join(" ")) : [];
  out.text = out.groups.join(" or ");
  return out;
}

/** The words of a query with everything else read out of it, as one string ("cheap iphon in kisumu under 20k" -> "iphon"). */
export const queryWords = (raw, context) => understandQuery(raw, context).groups[0] ?? "";
