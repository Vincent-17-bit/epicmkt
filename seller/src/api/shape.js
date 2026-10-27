import { imageUrl, nairobiNow, offerPhase, upcomingExceptions } from "@epicmkt/shared";

// Database rows (snake_case) to the shapes the pages use (camelCase). Live and mock return the same shapes.
export const business = (b) => b && ({
  id: b.id, sellerId: b.seller_id, name: b.name, status: b.status, planKey: b.plan_key, categoryId: b.category_id,
  paidUntil: b.paid_until ?? null, verificationLevel: b.verification_level, announcement: b.announcement ?? null,
  creditKes: Number(b.credit_kes ?? 0), strikes: b.strikes ?? 0, statusReason: b.status_reason ?? null,
  // Sign-in details. loginEmail is only ever set after the seller entered a code sent to it.
  loginEmail: b.login_email ?? null, loginEmailVerified: !!b.login_email && !!b.login_email_verified_at,
  mustChangePassword: !!b.must_change_password, passwordChangedAt: b.password_changed_at ?? null,
  logoPath: b.logo_path ?? null, coverPath: b.cover_path ?? null,
});

export const payment = (p) => ({
  id: p.id, businessId: p.business_id, amount: p.amount_kes, kind: p.kind, status: p.status,
  mpesaCode: p.mpesa_code ?? null, planKey: p.plan_key ?? null, categoryId: p.category_id ?? null, accountRef: p.account_ref ?? null,
  confirmedVia: p.confirmed_via ?? null, declineReason: p.decline_reason ?? null, receiptNo: p.receipt_no ?? null,
  periodStart: p.period_start ?? null, periodEnd: p.period_end ?? null, months: p.months ?? 1,
  submittedAt: p.submitted_at ?? null, confirmedAt: p.confirmed_at ?? null, createdAt: p.created_at,
});

export const instructions = (r) => ({
  purpose: r.purpose, amount: r.amount_kes, account: r.account, planKey: r.plan_key, categoryId: r.category_id,
  listingState: r.listing_state, quote: r.quote ?? null, configured: !!r.configured,
  method: r.method ?? null, number: r.number ?? null, name: r.name ?? null, hasOpenSubmission: !!r.has_open_submission,
  creditKes: Number(r.credit_kes ?? 0), amountDue: r.amount_due_kes ?? r.amount_kes, maxPrepayMonths: r.max_prepay_months ?? 12,
});

export const messageFile = (a) => ({ id: a.id, messageId: a.message_id, name: a.original_name, mime: a.mime, size: a.size_bytes, path: a.path, by: a.uploaded_by });

export const message = (m, attachments = []) => ({
  id: m.id, kind: m.kind, subject: m.subject, body: m.body, data: m.data ?? {}, readAt: m.read_at ?? null, createdAt: m.created_at,
  sender: m.sender ?? "system", threadId: m.thread_id ?? m.id, parentId: m.parent_id ?? null, needsReply: !!m.needs_reply,
  deliveredAt: m.delivered_at ?? null, adminDeliveredAt: m.admin_delivered_at ?? null, adminReadAt: m.admin_read_at ?? null, attachments,
});

export const change = (c) => ({
  id: c.id, field: c.field, oldValue: c.old_value ?? null, newValue: c.new_value, status: c.status, adminNote: c.admin_note ?? null,
  extraDue: c.extra_due_kes ?? 0, newMonthlyPrice: c.new_monthly_price ?? null, appliesFromNextRenewal: c.applies_from_next_renewal ?? true, createdAt: c.created_at,
});

export const attachment = (a) => ({ id: a.id, name: a.original_name, mime: a.mime, size: a.size_bytes, status: a.status });

export const question = (f, extra = {}) => ({
  id: f.id, message: f.seller_message, dueAt: f.due_at ?? null, status: f.status, reply: f.seller_reply ?? null, repliedAt: f.replied_at ?? null,
  itemId: f.item_id ?? null, faqId: f.faq_id ?? null, createdAt: f.created_at, attachments: [], ...extra,
});

export const plans = (rows) => Object.fromEntries(rows.map((p) => [p.plan_key, {
  price: p.price_kes, itemsLimit: null, topBenefits: p.top_benefits, features: p.features ?? {}, badge: p.badge ?? null,
}]));

export const ownItem = (i) => ({
  id: i.id, name: i.name, price: i.price === null || i.price === undefined ? null : Number(i.price), priceType: i.price_type,
  availability: i.availability, visible: i.visible, hiddenByAdmin: !!(i.hidden_by_admin || i.removed_by_admin),
});

export const flashSale = (s) => ({
  id: s.id, itemId: s.item_id, itemName: s.items?.name ?? s.item_name ?? "", regularPrice: s.items?.price === undefined || s.items?.price === null ? null : Number(s.items.price),
  headline: s.headline ?? null, startsAt: s.starts_at, endsAt: s.ends_at, discountType: s.discount_type, discountValue: Number(s.discount_value),
  quantityNote: s.quantity_note ?? null, afterEnd: s.after_end, status: s.status, endedAt: s.ended_at ?? null, endedReason: s.ended_reason ?? null, createdAt: s.created_at,
});

export const offer = (o) => ({
  id: o.id, scope: o.scope === "store" ? "store" : "product", kind: o.kind ?? null, config: o.config ?? {}, conditions: o.conditions ?? {}, title: o.title ?? null, description: o.description ?? null,
  chipText: o.chip_text ?? o.chipText ?? null, code: o.code ?? null, terms: o.terms ?? null, active: o.active !== false,
  startsAt: o.starts_at ?? o.startsAt ?? null, endsAt: o.ends_at ?? o.endsAt ?? null, status: o.status ?? "active", createdAt: o.created_at ?? o.createdAt ?? null,
  items: (o.offer_items ?? o.items ?? []).map((e) => ({ itemId: e.item_id ?? e.itemId, role: e.role ?? "main" })),
});

const num = (v) => (v === null || v === undefined ? null : Number(v));
// A stored picture becomes a url: Cloudinary for new pictures (a value with no file extension), the Supabase bucket for older ones,
// and blob: urls pass straight through (the demo mode and the cropper preview use them).
export const mediaUrl = (path) =>
  imageUrl(path, { cloudName: import.meta.env?.VITE_CLOUDINARY_CLOUD_NAME, supabaseUrl: import.meta.env?.VITE_SUPABASE_URL });

export const catalogItem = (i) => ({
  id: i.id, name: i.name, description: i.description ?? "", section: i.section ?? null,
  price: num(i.price), priceMax: num(i.price_max), priceType: i.price_type, unit: i.unit ?? null, salePrice: num(i.sale_price),
  availability: i.availability, stockCount: i.stock_count ?? null, trackStock: !!i.track_stock, lowStockThreshold: i.low_stock_threshold ?? 3,
  showStockCount: !!i.show_stock_count, availableFrom: i.available_from ?? null, season: i.season ?? null,
  visible: !!i.visible, draft: !!i.draft, sort: i.sort ?? 0, hiddenByAdmin: !!i.hidden_by_admin, removedByAdmin: !!i.removed_by_admin,
  adminHideReason: i.admin_hide_reason ?? i.admin_reason ?? null, tags: i.tags ?? [], badge: i.badge ?? null, variants: i.variants ?? [],
  priceConfirmedAt: i.price_confirmed_at ?? null, createdAt: i.created_at, updatedAt: i.updated_at,
  imagePaths: i.image_paths ?? [], imageCount: (i.image_paths ?? []).length, hasVideo: !!i.has_video,
  inFlashSale: !!i.in_flash_sale, specs: Array.isArray(i.specs) ? i.specs : [],
  brand: i.brand ?? null, shortDescription: i.short_description ?? null, packSize: i.pack_size ?? null, terms: i.terms ?? null, includes: Array.isArray(i.includes) ? i.includes : [], highlights: Array.isArray(i.highlights) ? i.highlights : [],
});

const customerSees = (i) => i.visible && !i.draft && !i.hiddenByAdmin && !i.removedByAdmin;

export const preview = (b, { categoryName, catalog: c, flashSales, offers = [], nowMs }) => ({
  shop: {
    slug: b.slug, name: b.name, tagline: b.tagline ?? "", description: b.description ?? "", planKey: b.plan_key, status: b.status,
    live: c.shop.live, verified: b.verification_level === "verified", county: b.county ?? "", town: b.town ?? "", address: b.address ?? "",
    lat: b.lat ?? null, lng: b.lng ?? null, phone: b.phone ?? null, whatsapp: b.whatsapp ?? null, socials: b.socials ?? {}, hours: b.hours ?? {},
    // Customers only ever get today and upcoming dates, so the preview shows the same.
    exceptions: upcomingExceptions(b.exceptions, nairobiNow().date).map(({ id, date, kind, intervals, note }) => ({ id, date, kind, intervals: intervals ?? [], note: note ?? null })),
    tags: b.tags ?? [], logoPath: b.logo_path ?? null, coverPath: b.cover_path ?? null, categoryName: categoryName ?? "",
  },
  items: c.items.filter(customerSees).sort((x, y) => x.sort - y.sort || Date.parse(y.createdAt) - Date.parse(x.createdAt)),
  flashSales: flashSales.filter((s) => s.status === "live" && Date.parse(s.startsAt) <= nowMs && Date.parse(s.endsAt) > nowMs),
  offers: offers.filter((o) => o.kind && offerPhase(o, nowMs) === "live"),
});

export const catalog = (r) => ({
  shop: { slug: r.shop.slug, status: r.shop.status, live: !!r.shop.live, planKey: r.shop.plan_key, itemsLimit: null },
  items: (r.items ?? []).map(catalogItem),
});

export const signal = (s) => ({ itemId: s.item_id, openFlags: s.open_flags ?? 0, reports30d: s.reports_30d ?? 0 });
