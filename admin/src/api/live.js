import { supabase } from "./supabase.js";

const unconfigured = () => {
  throw new Error("Supabase admin API not configured. Set VITE_SUPABASE_URL to enable live data.");
};

const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

const userId = async () => {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
};

const logEvent = async (applicationId, type, data) =>
  check(await supabase.from("application_events").insert({
    application_id: applicationId,
    actor: "admin",
    type,
    data: { ...data, by: await userId() },
  }));

const mapApplication = (a, documents) => ({
  id: a.id,
  reference: a.reference_no,
  status: a.status,
  verificationLevel: a.verification_level,
  categoryId: a.category_id,
  planKey: a.plan_key,
  price: a.price_at_submission,
  ownerName: a.owner_full_name,
  ownerIdType: a.owner_id_type,
  ownerIdNumber: a.owner_id_number,
  phone: a.phone,
  altPhone: a.alt_phone,
  email: a.email,
  businessName: a.business_name,
  registered: a.registered,
  regType: a.reg_type,
  regNumber: a.reg_number,
  yearEstablished: a.year_established,
  kraPin: a.kra_pin,
  sbpNumber: a.sbp_number,
  sbpExpiry: a.sbp_expiry,
  shortDescription: a.short_description,
  templateValues: a.template_values ?? {},
  county: a.county,
  town: a.town,
  address: a.address,
  lat: a.lat,
  lng: a.lng,
  businessPhones: a.business_phones ?? [],
  whatsapp: a.whatsapp,
  website: a.website,
  submittedAt: a.submitted_at,
  documents: documents.map((d) => ({
    id: d.id,
    slot: d.slot_key,
    path: d.storage_path,
    name: d.original_name,
    mime: d.mime,
    size: d.size_bytes,
    verified: d.verified,
  })),
});

const mapFlag = (f) => ({
  id: f.id,
  path: f.path,
  message: f.message,
  status: f.status,
  addressed: Boolean(f.addressed_at),
  createdAt: f.created_at,
  resolvedAt: f.resolved_at,
});

const mapNote = (n) => ({
  id: n.id,
  body: n.body,
  pinned: n.pinned,
  tags: n.tags,
  createdAt: n.created_at,
  updatedAt: n.updated_at,
});

export const liveAdminApi = {
  async getAdminCounts() { unconfigured(); },
  async getApplications() { unconfigured(); },
  async getBusinesses() { unconfigured(); },
  async getPayments() { unconfigured(); },

  async getApplication(id) {
    const [app, docs] = await Promise.all([
      supabase.from("applications").select("*").eq("id", id).single(),
      supabase.from("application_documents").select("*").eq("application_id", id).order("created_at"),
    ]);
    return mapApplication(check(app), check(docs));
  },

  async openApplication(id) {
    return check(await supabase.rpc("admin_open_application", { p_id: id }));
  },

  async returnToQueue(id) {
    return check(await supabase.rpc("admin_return_to_queue", { p_id: id }));
  },

  async getDocumentUrl(applicationId, doc) {
    check(await supabase.rpc("admin_log_document_view", { p_id: applicationId, p_slot: doc.slot }));
    const signed = check(await supabase.storage.from("applications").createSignedUrl(doc.path, 60));
    return { url: signed.signedUrl, expiresAt: Date.now() + 60_000 };
  },

  async setDocumentVerified(applicationId, doc, verified) {
    check(await supabase.from("application_documents").update({ verified }).eq("id", doc.id));
    await logEvent(applicationId, verified ? "document_verified" : "document_unverified", { slot: doc.slot });
  },

  async getDuplicates(id) {
    return check(await supabase.rpc("admin_duplicate_check", { p_id: id }));
  },

  async getFlags(applicationId) {
    const rows = check(await supabase.from("application_flags").select("*").eq("application_id", applicationId).order("created_at"));
    return rows.map(mapFlag);
  },

  async addFlag(applicationId, { path, message }) {
    check(await supabase.from("application_flags").insert({
      application_id: applicationId,
      path,
      message,
      created_by: await userId(),
    }));
    await logEvent(applicationId, "flag_added", { path });
  },

  async editFlag(applicationId, flag, message) {
    check(await supabase.from("application_flags")
      .update({ message, status: "open", resolved_at: null })
      .eq("id", flag.id));
    await logEvent(applicationId, "flag_edited", { path: flag.path });
  },

  async clearFlag(applicationId, flag) {
    check(await supabase.from("application_flags")
      .update({ status: "confirmed", resolved_at: new Date().toISOString() })
      .eq("id", flag.id));
    await logEvent(applicationId, "flag_cleared", { path: flag.path });
  },

  async getTimeline(applicationId) {
    const rows = check(await supabase.from("application_events").select("*").eq("application_id", applicationId).order("created_at", { ascending: false }).order("id", { ascending: false }));
    return rows.map((e) => ({ id: e.id, actor: e.actor, type: e.type, data: e.data, createdAt: e.created_at }));
  },

  async getNotes(applicationId) {
    const rows = check(await supabase.from("application_notes").select("*").eq("application_id", applicationId).order("pinned", { ascending: false }).order("created_at", { ascending: false }));
    return rows.map(mapNote);
  },

  async addNote(applicationId, { body, tags }) {
    check(await supabase.from("application_notes").insert({
      application_id: applicationId,
      body,
      tags,
      created_by: await userId(),
    }));
  },

  async updateNote(note, patch) {
    check(await supabase.from("application_notes").update(patch).eq("id", note.id));
  },
};

export default liveAdminApi;
