// Database rows (snake_case) to the shapes the pages use (camelCase). Live and mock return the same shapes.
export const business = (b) => b && ({
  id: b.id, sellerId: b.seller_id, name: b.name, status: b.status, planKey: b.plan_key, categoryId: b.category_id,
  paidUntil: b.paid_until ?? null, verificationLevel: b.verification_level, announcement: b.announcement ?? null,
});

export const payment = (p) => ({
  id: p.id, businessId: p.business_id, amount: p.amount_kes, kind: p.kind, status: p.status,
  mpesaCode: p.mpesa_code ?? null, planKey: p.plan_key ?? null, categoryId: p.category_id ?? null, accountRef: p.account_ref ?? null,
  confirmedVia: p.confirmed_via ?? null, declineReason: p.decline_reason ?? null, receiptNo: p.receipt_no ?? null,
  periodStart: p.period_start ?? null, periodEnd: p.period_end ?? null,
  submittedAt: p.submitted_at ?? null, confirmedAt: p.confirmed_at ?? null, createdAt: p.created_at,
});

export const instructions = (r) => ({
  purpose: r.purpose, amount: r.amount_kes, account: r.account, planKey: r.plan_key, categoryId: r.category_id,
  listingState: r.listing_state, quote: r.quote ?? null, configured: !!r.configured,
  method: r.method ?? null, number: r.number ?? null, name: r.name ?? null, hasOpenSubmission: !!r.has_open_submission,
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
