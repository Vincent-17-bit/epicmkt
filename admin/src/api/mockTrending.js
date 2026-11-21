// Demo twin of the trending admin functions (migration 0146). Local development only.
import { ApiError } from "./errors.js";

const wait = () => new Promise((r) => setTimeout(r, 60));
const clean = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const state = {
  popular: [
    { rank: 1, term: "gas cylinder", kind: "product", name: "Gas Cylinder 6kg", people: 41, hot: true, pinned: false },
    { rank: 2, term: "mama njeri bakery", kind: "store", name: "Mama Njeri Bakery", people: 33, hot: false, pinned: false },
    { rank: 3, term: "flash sneakers", kind: "flash", name: "Flash Sneakers", people: 27, hot: false, pinned: false },
    { rank: 4, term: "barber", kind: "category", name: "Barber", people: 19, hot: false, pinned: false },
    { rank: 5, term: "solar lamp", kind: "product", name: "Solar Lamp", people: 14, hot: true, pinned: false }
  ],
  rising: [{ rank: 1, term: "solar lamp", kind: "product", name: "Solar Lamp", people: 14, ratio: 7 }],
  pins: [],
  hidden: ["xxx"],
  synonyms: [{ variant: "gesi", canonical: "gas" }, { variant: "maji", canonical: "water" }],
  stale: false
};

export async function getTrendingOverview() {
  await wait();
  return {
    status: { ok: !state.stale, computedAt: new Date(Date.now() - (state.stale ? 7 : 1) * 3600_000).toISOString(), ageMinutes: state.stale ? 420 : 60, staleAfterHours: 5, minPeople: 3 },
    popular: state.popular, rising: state.rising, counties: ["kisumu", "nairobi"], pins: state.pins, hidden: state.hidden, synonyms: state.synonyms
  };
}

export async function pinTrending(term, days = 7, note = null) {
  await wait();
  const t = clean(term);
  if (t.length < 2) throw new ApiError("term must be 2 to 60 characters");
  if (state.pins.filter((p) => p.term !== t).length >= 3) throw new ApiError("at most 3 pinned terms at a time");
  state.pins = [...state.pins.filter((p) => p.term !== t), { term: t, note, expiresAt: new Date(Date.now() + days * 86400_000).toISOString() }];
  state.popular = state.popular.map((x) => ({ ...x, pinned: state.pins.some((p) => p.term === x.term) }));
}
export async function unpinTrending(term) {
  await wait();
  state.pins = state.pins.filter((p) => p.term !== clean(term));
  state.popular = state.popular.map((x) => ({ ...x, pinned: state.pins.some((p) => p.term === x.term) }));
}
export async function hideTrending(term) {
  await wait();
  const t = clean(term);
  if (!state.hidden.includes(t)) state.hidden = [...state.hidden, t].sort();
  state.popular = state.popular.filter((x) => !x.term.includes(t)).map((x, i) => ({ ...x, rank: i + 1 }));
  state.rising = state.rising.filter((x) => !x.term.includes(t)).map((x, i) => ({ ...x, rank: i + 1 }));
}
export async function unhideTrending(term) {
  await wait();
  state.hidden = state.hidden.filter((h) => h !== clean(term));
}
export async function setSynonym(variant, canonical) {
  await wait();
  const v = clean(variant), c = clean(canonical);
  if (v.length < 2 || c.length < 2 || v === c) throw new ApiError("two different words of at least 2 characters are needed");
  state.synonyms = [...state.synonyms.filter((s) => s.variant !== v), { variant: v, canonical: c }].sort((a, b) => a.variant.localeCompare(b.variant));
}
export async function removeSynonym(variant) {
  await wait();
  state.synonyms = state.synonyms.filter((s) => s.variant !== clean(variant));
}
