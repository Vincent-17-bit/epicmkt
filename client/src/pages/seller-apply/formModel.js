import { get, set } from "react-hook-form";
import { applicationSchema } from "../../shared/validators.js";

export const STEPS = [
  { id: "type", title: "Business type", paths: ["categoryId"] },
  { id: "you", title: "About you", paths: ["owner", "phone", "altPhone", "email"] },
  { id: "business", title: "About the business", paths: ["business", "templateValues"] },
  { id: "location", title: "Location and contacts", paths: ["location", "contacts"] },
  { id: "documents", title: "Documents", paths: [] },
  { id: "plan", title: "Package", paths: ["planKey"] },
  { id: "review", title: "Review and declare", paths: ["agreeTerms", "agreePrivacy", "authorised"] }
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
    whatsappSame: false,
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
  "owner.idNumber": "ID or passport number",
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
  "owner.idNumber": "Check the ID or passport number",
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
    return "Enter a valid Kenyan phone number, for example 0712 345 678";
  return FORMAT[path] ?? `${label}: please check this`;
}

export const requiredTemplateMissing = (cat, values = {}) =>
  (cat?.template ?? []).filter((f) => {
    if (!f.required || !fieldVisible(f, values)) return false;
    const v = values[f.key];
    if (f.type === "boolean") return v !== true && v !== false;
    return blank(v) || (Array.isArray(v) && v.length === 0);
  });

export function validateAll(values, cat) {
  const errors = {};
  const add = (path, message) => {
    if (!get(errors, path)) set(errors, path, { type: "validation", message });
  };
  const parsed = applicationSchema.safeParse(toPayload(values, cat));
  if (!parsed.success) parsed.error.issues.forEach((i) => add(i.path.join("."), friendly(i)));
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
