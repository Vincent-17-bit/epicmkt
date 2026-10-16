const SLOT_LABELS = {
  owner_id_front: "ID, front",
  owner_id_back: "ID, back",
  sbp: "Single Business Permit",
  signboard: "Signboard photo",
  br_cert: "Registration certificate",
  kra_pin_cert: "KRA PIN certificate",
};

const titleCase = (text) => text.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const slotLabel = (slot) => SLOT_LABELS[slot] ?? titleCase(slot.replace(/^cat_/, ""));

export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

export const fmtDate = (value) => (value ? new Date(value).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" }) : "—");

export const fmtSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const statusLabel = (status) => titleCase(status ?? "");

const plain = (value) => (value === null || value === undefined || value === "" ? "—" : String(value));

export const FIELD_GROUPS = [
  {
    title: "Owner",
    rows: [
      { path: "owner.fullName", label: "Full name", get: (a) => a.ownerName },
      { label: "ID type", get: (a) => titleCase(a.ownerIdType ?? "") },
      { path: "owner.idNumber", label: "ID number", get: (a) => a.ownerIdNumber },
      { path: "phone", label: "Phone", get: (a) => a.phone },
      { path: "altPhone", label: "Alternative phone", get: (a) => a.altPhone },
      { path: "email", label: "Email", get: (a) => a.email },
    ],
  },
  {
    title: "Business",
    rows: [
      { path: "business.name", label: "Name", get: (a) => a.businessName },
      { label: "Category", get: (a) => a.categoryId },
      { label: "Plan", get: (a) => `${titleCase(a.planKey ?? "")} · KES ${Number(a.price ?? 0).toLocaleString("en-KE")}` },
      { label: "Registered", get: (a) => (a.registered ? "Yes" : "No") },
      { path: "business.regType", label: "Registration type", get: (a) => (a.regType ? titleCase(a.regType) : null) },
      { path: "business.regNumber", label: "Registration number", get: (a) => a.regNumber },
      { path: "business.yearEstablished", label: "Year established", get: (a) => a.yearEstablished },
      { path: "business.kraPin", label: "KRA PIN", get: (a) => a.kraPin },
      { path: "business.sbpNumber", label: "SBP number", get: (a) => a.sbpNumber },
      { path: "business.sbpExpiry", label: "SBP expiry", get: (a) => fmtDate(a.sbpExpiry) },
      { path: "business.shortDescription", label: "Description", get: (a) => a.shortDescription },
    ],
  },
  {
    title: "Location",
    rows: [
      { path: "location.county", label: "County", get: (a) => a.county },
      { path: "location.town", label: "Town", get: (a) => a.town },
      { path: "location.address", label: "Address", get: (a) => a.address },
      { path: "location.lat", label: "Latitude", get: (a) => a.lat },
      { path: "location.lng", label: "Longitude", get: (a) => a.lng },
    ],
  },
  {
    title: "Contacts",
    rows: [
      { path: "contacts.businessPhones", label: "Business phones", get: (a) => (a.businessPhones ?? []).join(", ") },
      { path: "contacts.whatsapp", label: "WhatsApp", get: (a) => a.whatsapp },
      { path: "contacts.website", label: "Website", get: (a) => a.website },
    ],
  },
];

export const groupsFor = (app) => {
  const groups = FIELD_GROUPS.map((g) => ({
    title: g.title,
    rows: g.rows.map((r) => ({ path: r.path, label: r.label, value: plain(r.get(app)) })),
  }));
  const extras = Object.entries(app.templateValues ?? {});
  if (extras.length) {
    groups.push({
      title: "Category details",
      rows: extras.map(([key, value]) => ({
        path: `templateValues.${key}`,
        label: titleCase(key),
        value: plain(typeof value === "object" ? JSON.stringify(value) : value),
      })),
    });
  }
  return groups;
};

export const pathOptions = (app) => [
  ...groupsFor(app).flatMap((g) => g.rows.filter((r) => r.path).map((r) => ({ path: r.path, label: `${g.title}: ${r.label}` }))),
  ...app.documents.map((d) => ({ path: `documents.${d.slot}`, label: `Document: ${slotLabel(d.slot)}` })),
];

export const pathLabel = (app, path) => pathOptions(app).find((o) => o.path === path)?.label ?? path;

export const EVENT_TEXT = {
  submitted: "Application submitted",
  under_review: "Review started",
  returned_to_queue: "Returned to queue",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  payment_submitted: "Payment code submitted",
  activated: "Activated",
  document_viewed: "Viewed document",
  document_verified: "Marked document verified",
  document_unverified: "Removed document verification",
  flag_added: "Added flag",
  flag_edited: "Edited flag",
  flag_cleared: "Cleared flag",
};

export const eventText = (event) => {
  const base = EVENT_TEXT[event.type] ?? titleCase(event.type);
  const target = event.data?.slot ? slotLabel(event.data.slot) : event.data?.path ?? null;
  return target ? `${base}: ${target}` : base;
};
