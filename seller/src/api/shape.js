// Database rows (snake_case) to the shapes the pages use (camelCase). Live and mock return the same shapes.
export const business = (b) => b && ({
  id: b.id, sellerId: b.seller_id, name: b.name, status: b.status, planKey: b.plan_key, categoryId: b.category_id,
  paidUntil: b.paid_until ?? null, verificationLevel: b.verification_level, announcement: b.announcement ?? null,
  creditKes: Number(b.credit_kes ?? 0),
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

export const message = (m) => ({
  id: m.id, kind: m.kind, subject: m.subject, body: m.body, data: m.data ?? {}, readAt: m.read_at ?? null, createdAt: m.created_at,
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
  price: p.price_kes, itemsLimit: p.items_limit, topBenefits: p.top_benefits, features: p.features ?? {}, badge: p.badge ?? null,
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
