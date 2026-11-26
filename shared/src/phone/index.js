import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * Phone numbers for the whole world. One canonical form everywhere: E.164, "+" then the country code and the number
 * ("+254712345678"). People type it the way they know it (0712 345 678, (415) 555-2671); a country picker says which country.
 * Country names come from Intl.DisplayNames and calling codes from libphonenumber, so there is no list here to go stale.
 */

export const DEFAULT_COUNTRY = "KE";

/** Shown first in the picker, before the full alphabetical list. The platform's home region, then the biggest senders. */
export const SUGGESTED_COUNTRIES = ["KE", "UG", "TZ", "RW", "ET", "NG", "GH", "ZA", "GB", "US", "AE", "IN"];

/** Words people search for that are not the country's official English name. */
const ALIASES = {
  GB: "uk united kingdom britain england scotland wales",
  US: "usa united states america",
  AE: "uae emirates dubai",
  CI: "ivory coast",
  CZ: "czech republic",
  SZ: "swaziland eswatini",
  CD: "drc congo kinshasa",
  CG: "congo brazzaville",
  KR: "south korea",
  KP: "north korea",
  MM: "burma",
  TR: "turkey turkiye",
  NL: "holland"
};

/** "KE" -> the flag emoji, built from the two letters, so it needs no table. */
export const flagOf = (iso) => String.fromCodePoint(...[...String(iso).toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));

let regionNames;
export function countryName(iso) {
  if (regionNames === undefined) {
    try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch { regionNames = null; }
  }
  try { return regionNames?.of(iso) || iso; } catch { return iso; }
}

export const dialCodeOf = (iso) => `+${getCountryCallingCode(iso)}`;
export const isCountry = (iso) => getCountries().includes(iso);

const fold = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

let listed;
/** Every country, A to Z: { iso, name, dial, flag, search }. */
export function listCountries() {
  if (!listed) {
    listed = getCountries()
      .map((iso) => {
        const name = countryName(iso);
        return { iso, name, dial: dialCodeOf(iso), flag: flagOf(iso), search: fold(`${name} ${iso} ${ALIASES[iso] ?? ""}`) };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
  }
  return listed;
}

/** The countries that match what was typed: a name ("kenya", "ivory"), a code ("ke", "uk"), or a dial code ("254", "+44"). */
export function searchCountries(query) {
  const all = listCountries();
  const q = fold(query).trim();
  if (!q) return all;
  const digits = q.replace(/[^\d]/g, "");
  const dialOnly = /^\+?\d+$/.test(q);
  const hits = all.filter((c) => (dialOnly ? c.dial.slice(1).startsWith(digits) : c.search.includes(q)));
  // best first: an exact code or nickname ("uk" is the United Kingdom, not Ukraine), then names that start with it, then the rest
  const rank = (c) => {
    if (dialOnly) return c.dial === `+${digits}` ? 0 : 1;
    if (c.iso.toLowerCase() === q || c.search.split(" ").includes(q) && !fold(c.name).startsWith(q)) return 0;
    return fold(c.name).startsWith(q) ? 1 : 2;
  };
  const major = (c) => { const i = SUGGESTED_COUNTRIES.indexOf(c.iso); return i < 0 ? 99 : i; }; // +44 is the UK before Guernsey
  return hits.sort((a, b) => rank(a) - rank(b) || major(a) - major(b) || a.name.localeCompare(b.name, "en"));
}

function parse(text, country) {
  let t = String(text ?? "").trim();
  if (!t) return undefined;
  if (t.startsWith("00")) t = `+${t.slice(2)}`;
  if (t.startsWith("+")) return parsePhoneNumberFromString(t);
  const digits = t.replace(/\D/g, "");
  // 254712345678 typed without the plus: accept it when it is a real number with that country code
  const dial = country && isCountry(country) ? String(getCountryCallingCode(country)) : "";
  if (dial && digits.startsWith(dial)) {
    const full = parsePhoneNumberFromString(`+${digits}`);
    if (full?.isValid()) return full;
  }
  return parsePhoneNumberFromString(t, isCountry(country) ? country : DEFAULT_COUNTRY);
}

/**
 * What was typed, read for the chosen country. { e164, country, national, valid } or null when it is blank.
 * "e164" is the whole number even when it is not valid, so a half-typed number can still be held by a form.
 */
export function parsePhone(text, country = DEFAULT_COUNTRY) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const p = parse(raw, country);
  if (p) {
    const chosen = country && isCountry(country) && getCountryCallingCode(country) === p.countryCallingCode ? country : undefined;
    return { e164: p.number, country: chosen ?? p.country ?? null, national: p.formatNational(), valid: p.isValid() };
  }
  const digits = raw.replace(/\D/g, "");
  const dial = isCountry(country) ? getCountryCallingCode(country) : "";
  return { e164: raw.startsWith("+") || raw.startsWith("00") ? `+${digits.replace(/^00/, "")}` : `+${dial}${digits.replace(/^0+/, "")}`, country: null, national: raw, valid: false };
}

export const toE164 = (text, country) => parsePhone(text, country)?.e164 ?? "";

/** True when this is a real number in some country. A blank is not valid. */
export const isValidPhone = (text, country = DEFAULT_COUNTRY) => parsePhone(text, country)?.valid === true;

/** "+254712345678" -> "+254 712 345678", for showing a number to people. Anything unreadable is returned as it came. */
export function formatInternational(e164) {
  const p = parsePhoneNumberFromString(String(e164 ?? ""));
  return p ? p.formatInternational() : String(e164 ?? "");
}

/** Lays digits out the way people in that country write them, as they are typed. */
export const formatAsYouType = (digits, country) => new AsYouType(isCountry(country) ? country : DEFAULT_COUNTRY).input(String(digits ?? ""));

/**
 * Splits a stored value into what the picker shows. "keep" is the country already chosen: +1 is shared by the US and Canada,
 * so a number alone cannot say which of the two was picked.
 */
export function splitPhone(value, fallback = DEFAULT_COUNTRY, keep) {
  const base = keep && isCountry(keep) ? keep : isCountry(fallback) ? fallback : DEFAULT_COUNTRY;
  const raw = String(value ?? "").trim();
  if (!raw) return { country: base, text: "" };
  const p = parsePhone(raw, base);
  if (p?.valid || (p && /^\+/.test(raw) && p.country)) return { country: p.country ?? base, text: p.national };
  return { country: base, text: raw };
}
