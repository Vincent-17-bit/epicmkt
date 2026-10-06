export const FIELD_PATHS = [
  "owner.fullName",
  "owner.idNumber",
  "phone",
  "altPhone",
  "email",
  "business.name",
  "business.regType",
  "business.regNumber",
  "business.yearEstablished",
  "business.kraPin",
  "business.sbpNumber",
  "business.sbpExpiry",
  "business.shortDescription",
  "location.county",
  "location.town",
  "location.address",
  "location.lat",
  "location.lng",
  "contacts.businessPhones",
  "contacts.whatsapp",
  "contacts.website"
];

export const isTemplatePath = (p) => /^templateValues\.[A-Za-z0-9_-]{1,60}$/.test(p);
export const isDocPath = (p) => /^documents\.[a-z0-9_]{2,60}$/.test(p);
export const isEditablePath = (p) => FIELD_PATHS.includes(p) || isTemplatePath(p);
export const docSlot = (p) => p.slice("documents.".length);

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

export function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (const k of parts.slice(0, -1)) cur = cur[k] ??= {};
  const last = parts[parts.length - 1];
  if (value === "" || value === null || value === undefined) delete cur[last];
  else cur[last] = value;
}
