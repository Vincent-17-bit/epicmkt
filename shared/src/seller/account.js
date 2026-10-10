// Rules for the seller "My Account" page. The database enforces the same limits; keep both in step.
import { isValidPhoneKE, toE164KE } from "../utils.js";

export const LIMITS = {
  tagline: 80,
  description: 1500,
  announcement: 140,
  addressLine: 200,
  deliveryArea: 200,
  tags: 10,
  tagLength: 30,
  listItems: 30,
  listItemLength: 40,
  languages: 10,
  branches: 5,
  licenceDocs: 5,
};

export const LOCKED_FIELDS = ["name", "category_id", "location", "phone", "town", "licence", "licence_docs"];

export const SOCIAL_KEYS = ["facebook", "instagram", "tiktok", "x"];

export const LANGUAGES = ["English", "Kiswahili", "Sheng", "Kikuyu", "Luo", "Luhya", "Kalenjin", "Kamba", "Kisii", "Meru", "Somali", "Hindi", "French", "Arabic"];

export const PAYMENT_METHODS = ["Cash", "M-Pesa", "Airtel Money", "Card", "Bank transfer", "Cheque", "Pay on delivery"];

export const AMENITIES = ["Wi-Fi", "Parking", "Air conditioning", "Wheelchair access", "Toilets", "Waiting area", "Security", "Delivery", "Home service", "Open on public holidays"];

const LINK = /(https?:|www\.|@|\.(com|co\.ke|ke|org|net|info|biz)\b)/i;
const PHONE_LIKE = /[0-9][0-9 ().-]{5,}[0-9]/;

const TODAY_YEAR = () => new Date().getFullYear();

export const clean = (value) => String(value ?? "").trim();

/** Why an announcement is not allowed, or null. Short text only: no links, emails or phone numbers. */
export function announcementProblem(text) {
  const t = clean(text);
  if (!t) return null;
  if (t.length > LIMITS.announcement) return `Use up to ${LIMITS.announcement} characters`;
  if (LINK.test(t)) return "Remove links and email addresses from the banner";
  if (PHONE_LIKE.test(t)) return "Remove phone numbers from the banner";
  return null;
}

export const isWebsite = (value) => /^https?:\/\/[^\s]+\.[^\s]+$/i.test(clean(value));

/** Accepts a handle, @handle or a profile link and returns just the handle. */
export function normalizeHandle(value) {
  let v = clean(value);
  if (!v) return "";
  v = v.replace(/^https?:\/\/(www\.)?/i, "").replace(/^(facebook\.com|fb\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com)\//i, "");
  v = v.split(/[?#]/)[0].replace(/\/+$/, "").replace(/^@/, "");
  return v.split("/").pop();
}

export const isHandle = (value) => /^[A-Za-z0-9._-]{1,60}$/.test(value);

export const whatsappProblem = (value) => {
  const v = clean(value);
  return !v || isValidPhoneKE(v) ? null : "Enter a Kenyan number, for example 0712 345 678";
};

export const emailProblem = (value) => {
  const v = clean(value);
  return !v || (v.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) ? null : "Enter a valid email address";
};

/** Same shape the database stores: +2547... */
export const storePhone = (value) => {
  const v = clean(value);
  return v && isValidPhoneKE(v) ? `+${toE164KE(v)}` : null;
};

export function yearProblem(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1900 && n <= TODAY_YEAR() ? null : `Enter a year between 1900 and ${TODAY_YEAR()}`;
}

/** Validate a list of short strings (tags, amenities, ...). */
export function listProblem(items, { max, length, label = "items" }) {
  if (!Array.isArray(items)) return `Invalid ${label}`;
  if (items.length > max) return `Choose up to ${max} ${label}`;
  if (items.some((x) => !clean(x) || clean(x).length > length)) return `Each entry must be 1 to ${length} characters`;
  return null;
}

export const sameList = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Locked-field value helpers. A map pin travels as "lat,lng" with six decimals, like the database. */
export const pinValue = (lat, lng) => (Number.isFinite(lat) && Number.isFinite(lng) ? `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}` : null);

export function parsePin(value) {
  const m = /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(clean(value));
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return pinInKenya(lat, lng) ? { lat, lng } : null;
}

export const pinInKenya = (lat, lng) => lat >= -5 && lat <= 5.5 && lng >= 33.5 && lng <= 42.5;

/** Client-side check of a locked change before it is sent. Returns an error message or null. */
export function lockedProblem(field, value) {
  const v = clean(value);
  switch (field) {
    case "name":
      return v.length >= 2 && v.length <= 100 ? null : "Use 2 to 100 characters";
    case "category_id":
      return v ? null : "Choose a category";
    case "phone":
      return isValidPhoneKE(v) ? null : "Enter a Kenyan number, for example 0712 345 678";
    case "town":
      return v.length >= 2 && v.length <= 60 ? null : "Choose your town";
    case "licence":
      return v.length >= 3 && v.length <= 60 ? null : "Use 3 to 60 characters";
    case "location":
      return parsePin(v) ? null : "Place the pin inside Kenya";
    case "licence_docs": {
      try {
        const list = JSON.parse(v);
        return Array.isArray(list) && list.length >= 1 && list.length <= LIMITS.licenceDocs ? null : `Attach 1 to ${LIMITS.licenceDocs} documents`;
      } catch {
        return "Attach 1 to 5 documents";
      }
    }
    default:
      return "This field cannot be changed";
  }
}

/** Validate the fields of a profile patch the way seller_update_profile does. Returns { field: message }. */
export function profileProblems(patch = {}, { plan = "standard" } = {}) {
  const errors = {};
  if ("tagline" in patch && clean(patch.tagline).length > LIMITS.tagline) errors.tagline = `Use up to ${LIMITS.tagline} characters`;
  if ("description" in patch && clean(patch.description).length > LIMITS.description) errors.description = `Use up to ${LIMITS.description} characters`;
  if ("address" in patch && clean(patch.address).length > LIMITS.addressLine) errors.address = `Use up to ${LIMITS.addressLine} characters`;
  if ("delivery_area" in patch && clean(patch.delivery_area).length > LIMITS.deliveryArea) errors.delivery_area = `Use up to ${LIMITS.deliveryArea} characters`;
  if ("whatsapp" in patch && patch.whatsapp) {
    const p = whatsappProblem(patch.whatsapp);
    if (p) errors.whatsapp = p;
  }
  if ("email" in patch && patch.email) {
    const p = emailProblem(patch.email);
    if (p) errors.email = p;
  }
  if ("announcement" in patch && clean(patch.announcement)) {
    if (plan !== "premium") errors.announcement = "The announcement banner needs the Premium plan";
    else {
      const p = announcementProblem(patch.announcement);
      if (p) errors.announcement = p;
    }
  }
  if ("tags" in patch) {
    const p = listProblem(patch.tags, { max: LIMITS.tags, length: LIMITS.tagLength, label: "tags" });
    if (p) errors.tags = p;
  }
  for (const key of ["amenities", "payment_methods"]) {
    if (key in patch) {
      const p = listProblem(patch[key], { max: LIMITS.listItems, length: LIMITS.listItemLength, label: "options" });
      if (p) errors[key] = p;
    }
  }
  const profile = patch.profile;
  if (profile) {
    if ("year_established" in profile) {
      const p = yearProblem(profile.year_established);
      if (p) errors.year_established = p;
    }
    if (profile.website && !isWebsite(profile.website)) errors.website = "Enter a link starting with http:// or https://";
    if (profile.languages) {
      const p = listProblem(profile.languages, { max: LIMITS.languages, length: 30, label: "languages" });
      if (p) errors.languages = p;
    }
  }
  return errors;
}

/** Merge new profile keys into the stored profile and stamp the section's "last updated" time. */
export function mergeProfile(profile = {}, changes = {}, section, now = new Date()) {
  const next = { ...profile, ...changes };
  if (section) next.section_updated = { ...(profile.section_updated ?? {}), [section]: now.toISOString() };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return next;
}
