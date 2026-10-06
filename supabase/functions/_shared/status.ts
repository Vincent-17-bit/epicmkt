import { applicationSchema } from "./validate.ts";

export const SESSION_MINUTES = 30;
export const OTP_MINUTES = 10;

export const FIELD_COLUMNS: Record<string, string> = {
  "owner.fullName": "owner_full_name",
  "owner.idNumber": "owner_id_number",
  phone: "phone",
  altPhone: "alt_phone",
  email: "email",
  "business.name": "business_name",
  "business.regType": "reg_type",
  "business.regNumber": "reg_number",
  "business.yearEstablished": "year_established",
  "business.kraPin": "kra_pin",
  "business.sbpNumber": "sbp_number",
  "business.sbpExpiry": "sbp_expiry",
  "business.shortDescription": "short_description",
  "location.county": "county",
  "location.town": "town",
  "location.address": "address",
  "location.lat": "lat",
  "location.lng": "lng",
  "contacts.businessPhones": "business_phones",
  "contacts.whatsapp": "whatsapp",
  "contacts.website": "website",
};

export const isTemplatePath = (p: string) => /^templateValues\.[A-Za-z0-9_-]{1,60}$/.test(p);
export const isDocPath = (p: string) => /^documents\.[a-z0-9_]{2,60}$/.test(p);
export const isEditablePath = (p: string) => p in FIELD_COLUMNS || isTemplatePath(p);

export const nowPlus = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

export async function sessionApp(db: any, sha256Hex: (s: string) => Promise<string>, token: unknown) {
  if (typeof token !== "string" || token.length < 32) return null;
  const { data: s } = await db
    .from("status_sessions")
    .select("application_id, expires_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!s || new Date(s.expires_at).getTime() <= Date.now()) return null;
  const { data: app } = await db.from("applications").select("*").eq("id", s.application_id).maybeSingle();
  return app && app.status !== "uploading" ? app : null;
}

export function rowToPayload(a: any) {
  return {
    categoryId: a.category_id,
    planKey: a.plan_key,
    owner: { fullName: a.owner_full_name, idType: a.owner_id_type, idNumber: a.owner_id_number },
    phone: a.phone,
    altPhone: a.alt_phone ?? undefined,
    email: a.email,
    business: {
      name: a.business_name,
      registered: a.registered,
      regType: a.reg_type ?? undefined,
      regNumber: a.reg_number ?? undefined,
      yearEstablished: a.year_established,
      kraPin: a.kra_pin ?? undefined,
      sbpNumber: a.sbp_number,
      sbpExpiry: a.sbp_expiry,
      shortDescription: a.short_description ?? undefined,
    },
    location: { county: a.county, town: a.town, address: a.address, lat: a.lat, lng: a.lng },
    contacts: {
      businessPhones: a.business_phones,
      whatsapp: a.whatsapp,
      website: a.website ?? undefined,
      socials: a.socials ?? {},
    },
    templateValues: a.template_values ?? {},
    conditionalDocs: a.conditional_docs ?? {},
    termsVersion: a.terms_version,
    privacyVersion: a.privacy_version,
    agreeTerms: true,
    agreePrivacy: true,
    authorised: true,
  };
}

function setPath(obj: any, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (const k of parts.slice(0, -1)) cur = cur[k] ??= {};
  const last = parts[parts.length - 1];
  if (value === "" || value === null) delete cur[last];
  else cur[last] = value;
}

export function applyPatch(row: any, patch: Record<string, unknown>) {
  const payload: any = structuredClone(rowToPayload(row));
  for (const [path, value] of Object.entries(patch)) setPath(payload, path, value);
  const parsed = applicationSchema.safeParse(payload);
  const paths = Object.keys(patch);
  const issues = parsed.success
    ? []
    : parsed.error.issues
        .map((i) => ({ path: i.path.join("."), message: i.message }))
        .filter((i) => paths.some((p) => i.path === p || i.path.startsWith(`${p}.`) || p.startsWith(`${i.path}.`)));
  return { issues, data: parsed.success ? parsed.data : null, payload };
}

export function columnUpdates(row: any, patch: Record<string, unknown>, data: any) {
  const out: Record<string, unknown> = {};
  const get = (obj: any, path: string) => path.split(".").reduce((o, k) => o?.[k], obj);
  for (const path of Object.keys(patch)) {
    if (isTemplatePath(path)) {
      out.template_values = { ...(out.template_values ?? row.template_values ?? {}), [path.split(".")[1]]: get(data, path) };
    } else {
      out[FIELD_COLUMNS[path]] = get(data, path) ?? null;
    }
  }
  return out;
}

export const flagView = (f: any) => ({
  id: f.id,
  path: f.path,
  message: f.message,
  severity: f.severity,
  status: f.status,
  addressed: !!f.addressed_at,
  createdAt: f.created_at,
  resolvedAt: f.resolved_at ?? undefined,
});

const PLAN_NAME: Record<string, string> = { standard: "Standard", premium: "Premium" };
const PUBLIC_EVENTS = ["submitted", "under_review", "changes_requested", "approved", "payment_submitted", "activated", "rejected"];

export async function viewApplication(db: any, a: any) {
  const [{ data: docs }, { data: flags }, { data: events }, { data: cat }, { data: setting }] = await Promise.all([
    db.from("application_documents").select("slot_key, storage_path, original_name, mime, size_bytes").eq("application_id", a.id).eq("verified", true),
    db.from("application_flags").select("*").eq("application_id", a.id).order("created_at"),
    db.from("application_events").select("type, created_at").eq("application_id", a.id).in("type", PUBLIC_EVENTS).order("created_at"),
    db.from("categories").select("id, name").eq("id", a.category_id).maybeSingle(),
    db.from("site_settings").select("value").eq("key", "mpesa").maybeSingle(),
  ]);

  const paths = (docs ?? []).map((d: any) => d.storage_path);
  const signed = paths.length ? (await db.storage.from("applications").createSignedUrls(paths, 600)).data ?? [] : [];
  const urlOf = (p: string) => signed.find((s: any) => s.path === p)?.signedUrl ?? null;

  const showPay = a.status === "approved" || a.status === "payment_confirming";
  const m = setting?.value;
  return {
    referenceNo: a.reference_no,
    status: a.status,
    submittedAt: a.submitted_at,
    updatedAt: a.updated_at,
    category: { id: a.category_id, name: cat?.name ?? a.category_id },
    plan: { key: a.plan_key, name: PLAN_NAME[a.plan_key] ?? a.plan_key },
    priceAtSubmission: a.price_at_submission,
    owner: { fullName: a.owner_full_name, idType: a.owner_id_type, idNumber: a.owner_id_number },
    phone: a.phone,
    altPhone: a.alt_phone,
    email: a.email,
    business: {
      name: a.business_name, registered: a.registered, regType: a.reg_type, regNumber: a.reg_number,
      yearEstablished: a.year_established, kraPin: a.kra_pin, sbpNumber: a.sbp_number, sbpExpiry: a.sbp_expiry,
      shortDescription: a.short_description,
    },
    templateValues: a.template_values,
    conditionalDocs: a.conditional_docs,
    location: { county: a.county, town: a.town, address: a.address, lat: a.lat, lng: a.lng },
    contacts: { businessPhones: a.business_phones, whatsapp: a.whatsapp, website: a.website, socials: a.socials },
    documents: (docs ?? []).map((d: any) => ({ slot: d.slot_key, name: d.original_name, mime: d.mime, size: d.size_bytes, url: urlOf(d.storage_path) })),
    adminNote: a.admin_note,
    rejectionReason: a.status === "rejected" ? a.rejection_reason : null,
    flags: (flags ?? []).map(flagView),
    events: (events ?? []).map((e: any) => ({ type: e.type, at: e.created_at })),
    payment: showPay
      ? { method: m?.type ?? null, number: m?.number ?? null, account: m?.account ?? null, name: m?.name ?? null, amount: a.price_at_submission, code: a.payment_code }
      : null,
  };
}
