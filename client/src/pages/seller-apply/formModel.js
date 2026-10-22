import { get, set } from "react-hook-form";
import { applicationSchema, normalizePhone } from "../../shared/validators.js";
import { idNumberError } from "./idTypes.js";
import { todayISO } from "./masks.js";

export const STEPS = [
  {
    id: "business",
    title: "Your business",
    short: "Business",
    paths: ["categoryId", "business.name", "business.shortDescription", "templateValues"]
  },
  { id: "you", title: "About you", short: "You", paths: ["owner", "phone", "altPhone", "email"] },
  { id: "place", title: "Where customers find you", short: "Location", paths: ["location", "contacts"] },
  {
    id: "papers",
    title: "Permits and documents",
    short: "Documents",
    paths: [
      "business.registered",
      "business.regType",
      "business.regNumber",
      "business.kraPin",
      "business.sbpNumber",
      "business.sbpExpiry",
      "business.yearEstablished",
      "conditionalDocs"
    ]
  },
  { id: "send", title: "Package and send", short: "Send", paths: ["planKey", "agreeTerms", "agreePrivacy", "authorised"] }
];

export const emptyValues = () => ({
  categoryId: "",
  planKey: "",
  owner: { fullName: "", idType: "national_id", idNumber: "" },
  phone: "",
  altPhone: "",
  email: "",
  business: {
    name: "",
    registered: null,
    regType: "",
    regNumber: "",
    yearEstablished: "",
    kraPin: "",
    sbpNumber: "",
    sbpExpiry: "",
    shortDescription: ""
  },
  location: { county: "", town: "", address: "", lat: null, lng: null },
  contacts: {
    businessPhones: [""],
    whatsapp: "",
    whatsappSame: true,
    website: "",
    socials: { facebook: "", instagram: "", x: "", tiktok: "" }
  },
  templateValues: {},
  conditionalDocs: {},
  termsVersion: "",
  privacyVersion: "",
  agreeTerms: false,
  agreePrivacy: false,
  authorised: false
});

const blank = (v) => v === "" || v === null || v === undefined;

function prune(value) {
  if (typeof value === "string") return value.trim() === "" ? undefined : value.trim();
  if (Array.isArray(value)) return value.map(prune).filter((v) => v !== undefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const p = prune(v);
      if (p !== undefined) out[k] = p;
    }
    return out;
  }
  return value === null ? undefined : value;
}

export const fieldVisible = (field, values) =>
  !field.showIf || values?.[field.showIf.field] === field.showIf.equals;

export function templatePayload(cat, values = {}) {
  const out = {};
  for (const f of cat?.template ?? []) {
    if (!fieldVisible(f, values)) continue;
    const v = prune(values[f.key]);
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    out[f.key] = v;
  }
  return out;
}

export function toPayload(values, cat) {
  const b = values.business;
  const registered = b.registered === true;
  const year = blank(b.yearEstablished) ? undefined : Number(b.yearEstablished);
  const raw = {
    categoryId: values.categoryId,
    planKey: values.planKey,
    owner: values.owner,
    phone: values.phone,
    altPhone: values.altPhone,
    email: values.email,
    business: {
      name: b.name,
      registered: b.registered === null ? undefined : registered,
      regType: registered ? b.regType : "",
      regNumber: registered ? b.regNumber : "",
      yearEstablished: year,
      kraPin: b.kraPin,
      sbpNumber: b.sbpNumber,
      sbpExpiry: b.sbpExpiry,
      shortDescription: b.shortDescription
    },
    location: values.location,
    contacts: {
      businessPhones: values.contacts.businessPhones,
      whatsapp: values.contacts.whatsappSame ? values.contacts.businessPhones[0] : values.contacts.whatsapp,
      website: values.contacts.website,
      socials: values.contacts.socials
    },
    templateValues: templatePayload(cat, values.templateValues),
    conditionalDocs: values.conditionalDocs,
    termsVersion: values.termsVersion,
    privacyVersion: values.privacyVersion,
    agreeTerms: values.agreeTerms,
    agreePrivacy: values.agreePrivacy,
    authorised: values.authorised
  };
  return prune(raw);
}

export const LABELS = {
  categoryId: "Business type",
  planKey: "Package",
  "owner.fullName": "Full names",
  "owner.idNumber": "ID number",
  phone: "Phone number",
  altPhone: "Alternative phone",
  email: "Email address",
  "business.name": "Business name",
  "business.registered": "Registration status",
  "business.regType": "Registration type",
  "business.regNumber": "Registration number",
  "business.yearEstablished": "Year established",
  "business.kraPin": "KRA PIN",
  "business.sbpNumber": "Single Business Permit number",
  "business.sbpExpiry": "Permit expiry date",
  "business.shortDescription": "Short description",
  "location.county": "County",
  "location.town": "Town or area",
  "location.address": "Address or landmark",
  "location.lat": "Map pin",
  "location.lng": "Map pin",
  "contacts.businessPhones": "Business phone",
  "contacts.whatsapp": "WhatsApp number",
  "contacts.website": "Website"
};

const FORMAT = {
  "owner.fullName": "Enter your full names as on your ID",
  "owner.idNumber": "Check the ID, Maisha Card or passport number",
  "business.name": "Use 3 to 60 characters, with no emoji or links",
  "business.yearEstablished": "Enter a year from 1900 to this year",
  "business.kraPin": "Enter a valid KRA PIN, for example A123456789Z",
  "business.sbpExpiry": "Choose the expiry date on your permit",
  "business.shortDescription": "Keep it under 160 characters, with no links",
  email: "Enter a valid email address",
  "contacts.website": "Enter a full web address starting with https://"
};

const MISSING = {
  "location.lat": "Drop the pin on the map",
  "location.lng": "Drop the pin on the map",
  "business.registered": "Choose registered or not registered",
  planKey: "Choose a package",
  categoryId: "Choose your business type",
  agreeTerms: "Open and read the Seller Terms and Rules to continue",
  agreePrivacy: "Open and read the Privacy Notice to continue",
  authorised: "Confirm this declaration to continue"
};

export function friendly(issue) {
  const path = issue.path.join(".").replace(/\.\d+$/, "");
  if (issue.code === "custom") return issue.message;
  if (MISSING[path]) return MISSING[path];
  const label = LABELS[path] ?? "This field";
  const empty =
    issue.code === "invalid_type" ||
    (issue.code === "too_small" && issue.type === "string" && Number(issue.minimum) <= 1);
  if (empty) return `${label} is required`;
  if (path.startsWith("contacts.businessPhones") || ["phone", "altPhone", "contacts.whatsapp"].includes(path))
    return PHONE_HELP;
  return FORMAT[path] ?? `${label}: please check this`;
}

export const requiredTemplateMissing = (cat, values = {}) =>
  (cat?.template ?? []).filter((f) => {
    if (!f.required || !fieldVisible(f, values)) return false;
    const v = values[f.key];
    if (f.type === "boolean") return v !== true && v !== false;
    return blank(v) || (Array.isArray(v) && v.length === 0);
  });

export const PHONE_HELP = "Enter a valid phone number, for example 0712 345 678 or +44 7911 123456";

/** [path, message] pairs for the business phones and the WhatsApp number, one per offending input. */
export function phoneErrors(contacts = {}) {
  const out = [];
  const phones = Array.isArray(contacts.businessPhones) && contacts.businessPhones.length ? contacts.businessPhones : [""];
  phones.forEach((raw, i) => {
    const v = String(raw ?? "").trim();
    if (!v) {
      if (i === 0) out.push(["contacts.businessPhones.0", "Enter your business phone number"]);
    } else if (!normalizePhone(v)) {
      out.push([`contacts.businessPhones.${i}`, PHONE_HELP]);
    }
  });
  if (!contacts.whatsappSame) {
    const w = String(contacts.whatsapp ?? "").trim();
    if (!w) out.push(["contacts.whatsapp", "Enter your WhatsApp number, or tick \"Same as my first business phone\""]);
    else if (!normalizePhone(w)) out.push(["contacts.whatsapp", PHONE_HELP]);
  }
  return out;
}

const kraOk = (v) => /^[AP]\d{9}[A-Z]$/.test(String(v ?? "").trim().toUpperCase());

/**
 * The schema runs its cross-field checks only once every single field is valid, so a person would fix three
 * mistakes and then be told about a fourth. These run on their own so every problem shows at once.
 * The server still enforces the same rules.
 */
export function crossChecks(values) {
  const out = [];
  const idMessage = idNumberError(values.owner?.idType, values.owner?.idNumber);
  if (idMessage) out.push(["owner.idNumber", idMessage]);
  const b = values.business ?? {};
  const expiry = String(b.sbpExpiry ?? "");
  if (expiry && expiry < todayISO()) out.push(["business.sbpExpiry", "Your Single Business Permit has expired"]);
  if (b.registered === true) {
    if (!b.regType) out.push(["business.regType", "Choose the registration type"]);
    if (!String(b.regNumber ?? "").trim()) out.push(["business.regNumber", "Enter the registration number"]);
    if (!kraOk(b.kraPin)) out.push(["business.kraPin", "Enter a valid KRA PIN, for example A123456789Z"]);
  } else if (String(b.kraPin ?? "").trim() && !kraOk(b.kraPin)) {
    out.push(["business.kraPin", "Enter a valid KRA PIN, for example A123456789Z"]);
  }
  return out;
}

export function validateAll(values, cat) {
  const errors = {};
  const add = (path, message) => {
    if (!get(errors, path)) set(errors, path, { type: "validation", message });
  };
  const parsed = applicationSchema.safeParse(toPayload(values, cat));
  // Phones are checked field by field below, so each message lands on the box that caused it.
  const isPhonePath = (path) => path === "contacts.whatsapp" || path === "contacts.businessPhones" || path.startsWith("contacts.businessPhones.");
  if (!parsed.success) parsed.error.issues.forEach((i) => {
    const path = i.path.join(".");
    if (!isPhonePath(path)) add(path, friendly(i));
  });
  crossChecks(values).forEach(([path, message]) => add(path, message));
  phoneErrors(values.contacts).forEach(([path, message]) => add(path, message));
  for (const f of requiredTemplateMissing(cat, values.templateValues)) add(`templateValues.${f.key}`, `${f.label} is required`);
  return errors;
}

export const makeResolver = (getCat) => async (values) => ({
  values,
  errors: validateAll(values, getCat(values.categoryId))
});

export const stepHasErrors = (errors, step) => step.paths.some((p) => !!get(errors, p));

export function flattenErrors(errors, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(errors ?? {})) {
    if (!v) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v.message === "string") out.push({ path, message: v.message });
    else out.push(...flattenErrors(v, path));
  }
  return out;
}
