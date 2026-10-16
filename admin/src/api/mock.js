const mockCounts = {
  brief: "4 applications are waiting, 2 payments need confirming and 6 sellers expire this week",
  liveBusinesses: 142,
  applicationsWaiting: 14,
  unconfirmedPayments: 3,
  expiringSoon: 6,
};

const mockApplications = [
  { id: "app-2049", reference: "APP-2049", businessName: "Mara Fresh Mart", ownerName: "Alice Njeri", status: "Submitted", submittedAt: "Today, 09:12" },
  { id: "app-2050", reference: "APP-2050", businessName: "Umoja Hardware", ownerName: "John Ouma", status: "Under review", submittedAt: "Today, 11:40" },
  { id: "app-2051", reference: "APP-2051", businessName: "Green Valley Foods", ownerName: "Mary Wambui", status: "Needs changes", submittedAt: "Yesterday" },
];

const mockBusinesses = [
  { name: "Mara Fresh Mart", town: "Nairobi", plan: "Premium", status: "Live", paidUntil: "2026-11-18" },
  { name: "Umoja Hardware", town: "Kisumu", plan: "Standard", status: "Live", paidUntil: "2026-11-02" },
  { name: "Green Valley Foods", town: "Mombasa", plan: "Premium", status: "Expiring soon", paidUntil: "2026-10-15" },
];

const mockPayments = [
  { receipt: "RCP-1024", businessName: "Mara Fresh Mart", amount: 3200, status: "Confirmed", mpesaCode: "MPESA-4411" },
  { receipt: "RCP-1025", businessName: "Umoja Hardware", amount: 2500, status: "Pending", mpesaCode: "MPESA-4412" },
  { receipt: "RCP-1026", businessName: "Green Valley Foods", amount: 4500, status: "Rejected", mpesaCode: "MPESA-4413" },
];

const wait = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 120));

const slip = (label, tint) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560"><rect width="800" height="560" fill="${tint}"/><rect x="40" y="40" width="720" height="480" rx="16" fill="none" stroke="#111" stroke-width="4"/><text x="400" y="290" font-family="sans-serif" font-size="44" text-anchor="middle" fill="#111">${label}</text></svg>`,
  )}`;

const pdfBlobUrl = () =>
  URL.createObjectURL(
    new Blob(
      ["%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"],
      { type: "application/pdf" },
    ),
  );

const store = {
  opened: new Set(),
  verified: { "owner_id_front": true },
  flags: {
    "app-2050": [
      { id: "f1", path: "business.sbpNumber", message: "Permit number does not match the document", status: "open", addressed: false, createdAt: "2026-10-15T08:20:00Z", resolvedAt: null },
      { id: "f2", path: "documents.signboard", message: "Photo is too dark to read the signboard", status: "fixed", addressed: true, createdAt: "2026-10-14T13:05:00Z", resolvedAt: null },
    ],
  },
  notes: {
    "app-2050": [
      { id: "n1", body: "Owner called, confirmed the Kisumu branch address.", pinned: true, tags: ["call"], createdAt: "2026-10-15T09:10:00Z", updatedAt: "2026-10-15T09:10:00Z" },
    ],
  },
  events: {
    "app-2050": [
      { id: 3, actor: "admin", type: "flag_added", data: { path: "business.sbpNumber" }, createdAt: "2026-10-15T08:20:00Z" },
      { id: 2, actor: "admin", type: "under_review", data: {}, createdAt: "2026-10-15T08:14:00Z" },
      { id: 1, actor: "seller", type: "submitted", data: {}, createdAt: "2026-10-14T13:00:00Z" },
    ],
  },
  status: {},
};

const detailFor = (row) => ({
  id: row.id,
  reference: row.reference,
  status: store.status[row.id] ?? row.status.toLowerCase().replace(/ /g, "_"),
  verificationLevel: "unverified",
  categoryId: "hardware",
  planKey: "standard",
  price: 2500,
  ownerName: row.ownerName,
  ownerIdType: "national_id",
  ownerIdNumber: "28411907",
  phone: "+254700123456",
  altPhone: null,
  email: "owner@example.co.ke",
  businessName: row.businessName,
  registered: true,
  regType: "sole_proprietor",
  regNumber: "BN-4471920",
  yearEstablished: 2019,
  kraPin: "A012345678Z",
  sbpNumber: "SBP-2026-00831",
  sbpExpiry: "2026-12-31",
  shortDescription: "Building materials and tools.",
  templateValues: {},
  county: "Kisumu",
  town: "Kisumu",
  address: "Oginga Odinga Street, next to the market",
  lat: -0.0917,
  lng: 34.768,
  businessPhones: ["+254700123456"],
  whatsapp: "+254700123456",
  website: null,
  submittedAt: "2026-10-14T13:00:00Z",
  documents: [
    { id: `${row.id}-d1`, slot: "owner_id_front", path: "mock", name: "id-front.jpg", mime: "image/jpeg", size: 412000, verified: Boolean(store.verified[`${row.id}-d1`] ?? store.verified.owner_id_front) },
    { id: `${row.id}-d2`, slot: "owner_id_back", path: "mock", name: "id-back.jpg", mime: "image/jpeg", size: 388000, verified: Boolean(store.verified[`${row.id}-d2`]) },
    { id: `${row.id}-d3`, slot: "sbp", path: "mock", name: "permit.pdf", mime: "application/pdf", size: 902000, verified: Boolean(store.verified[`${row.id}-d3`]) },
    { id: `${row.id}-d4`, slot: "signboard", path: "mock", name: "signboard.png", mime: "image/png", size: 1204000, verified: Boolean(store.verified[`${row.id}-d4`]) },
    { id: `${row.id}-d5`, slot: "br_cert", path: "mock", name: "registration.pdf", mime: "application/pdf", size: 640000, verified: Boolean(store.verified[`${row.id}-d5`]) },
    { id: `${row.id}-d6`, slot: "kra_pin_cert", path: "mock", name: "kra.jpg", mime: "image/jpeg", size: 280000, verified: Boolean(store.verified[`${row.id}-d6`]) },
  ],
});

const rowOf = (id) => mockApplications.find((r) => r.id === id);
const push = (id, type, data) => {
  const list = (store.events[id] ??= []);
  list.unshift({ id: Date.now() + list.length, actor: "admin", type, data, createdAt: new Date().toISOString() });
};

export const mockAdminApi = {
  async getAdminCounts() {
    return mockCounts;
  },
  async getApplications() {
    return mockApplications;
  },
  async getBusinesses() {
    return mockBusinesses;
  },
  async getPayments() {
    return mockPayments;
  },

  async getApplication(id) {
    const row = rowOf(id);
    if (!row) throw new Error("not_found");
    return wait(detailFor(row));
  },

  async openApplication(id) {
    if (store.status[id] === undefined && rowOf(id)?.status === "Submitted") {
      store.status[id] = "under_review";
      push(id, "under_review", {});
    }
    return wait(store.status[id] ?? "under_review");
  },

  async returnToQueue(id) {
    if (store.status[id] === "under_review") {
      store.status[id] = "submitted";
      push(id, "returned_to_queue", {});
    }
    return wait(store.status[id]);
  },

  async getDocumentUrl(applicationId, doc) {
    push(applicationId, "document_viewed", { slot: doc.slot });
    const url = doc.mime === "application/pdf" ? pdfBlobUrl() : slip(doc.slot.replace(/_/g, " "), "#e6f5ff");
    return wait({ url, expiresAt: Date.now() + 60_000 });
  },

  async setDocumentVerified(applicationId, doc, verified) {
    store.verified[doc.id] = verified;
    push(applicationId, verified ? "document_verified" : "document_unverified", { slot: doc.slot });
    return wait();
  },

  async getDuplicates(id) {
    return wait(
      id === "app-2050"
        ? [{ field: "phone", kind: "application", id: "app-2031", reference: "APP-2031", name: "Umoja Hardware (earlier)", status: "rejected" }]
        : [],
    );
  },

  async getFlags(id) {
    return wait([...(store.flags[id] ?? [])]);
  },

  async addFlag(id, { path, message }) {
    (store.flags[id] ??= []).push({ id: `f${Date.now()}`, path, message, status: "open", addressed: false, createdAt: new Date().toISOString(), resolvedAt: null });
    push(id, "flag_added", { path });
    return wait();
  },

  async editFlag(id, flag, message) {
    const target = store.flags[id].find((f) => f.id === flag.id);
    Object.assign(target, { message, status: "open", resolvedAt: null });
    push(id, "flag_edited", { path: flag.path });
    return wait();
  },

  async clearFlag(id, flag) {
    const target = store.flags[id].find((f) => f.id === flag.id);
    Object.assign(target, { status: "confirmed", resolvedAt: new Date().toISOString() });
    push(id, "flag_cleared", { path: flag.path });
    return wait();
  },

  async getTimeline(id) {
    return wait([...(store.events[id] ?? [])]);
  },

  async getNotes(id) {
    const list = [...(store.notes[id] ?? [])];
    return wait(list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)));
  },

  async addNote(id, { body, tags }) {
    const now = new Date().toISOString();
    (store.notes[id] ??= []).push({ id: `n${Date.now()}`, body, pinned: false, tags, createdAt: now, updatedAt: now });
    return wait();
  },

  async updateNote(note, patch) {
    for (const list of Object.values(store.notes)) {
      const target = list.find((n) => n.id === note.id);
      if (target) Object.assign(target, patch, { updatedAt: new Date().toISOString() });
    }
    return wait();
  },
};

export default mockAdminApi;
