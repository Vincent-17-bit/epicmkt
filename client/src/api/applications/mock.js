import { categories } from '../../data/categories';
import { GLOBAL_LIMITS, planRows } from '../../config/plans.seed';
import { legalDocs } from '../../data/legal';
import { getPricingOverrides, saveApplication, saveFiles } from './mockStore';
import { applicationSchema, requiredSlots, allowedSlots } from '../../shared/validators';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NOW = '2026-10-05T00:00:00.000Z';

const toPlan = (row, o = {}) => ({
  price: o.price ?? row.price_kes,
  limits: { items: o.items ?? row.items_limit },
  topBenefits: o.topBenefits ?? row.top_benefits,
  features: row.features,
  badge: o.badge === undefined ? row.badge : o.badge,
  updatedAt: o.updatedAt ?? NOW,
});

const catalog = () => categories.map((c) => ({
  id: c.id,
  name: c.name,
  group: c.group,
  icon: c.icon,
  tier: c.tier,
  template: c.keyFields,
  extraDocs: c.extraDocs,
  plans: Object.fromEntries(planRows(c.id, c.tier).map((r) => [r.plan_key, toPlan(r, getPricingOverrides().plans[`${c.id}:${r.plan_key}`])])),
}));

export async function getCatalogPricing() {
  await wait(200);
  return {
    categories: catalog(),
    globalLimits: {
      standard: { ...GLOBAL_LIMITS.standard, ...getPricingOverrides().limits.standard },
      premium: { ...GLOBAL_LIMITS.premium, ...getPricingOverrides().limits.premium },
      updated_at: NOW,
    },
  };
}

export async function getLegalDocs() {
  await wait(150);
  return Object.fromEntries(
    legalDocs.map((d) => [d.key, { key: d.key, version: d.version, title: d.title, body: d.body, key_points: d.keyPoints }]),
  );
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const referenceNo = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const tail = [...bytes].map((b) => ALPHABET[b % 32]).join('');
  return `EPM-${new Date().getFullYear()}-${tail}`;
};

const apiError = (code, details) => Object.assign(new Error(code), { details: { error: code, ...details } });

export async function submitApplication({ payload, files, startedAt, hp }, onFileStatus = () => {}) {
  await wait(300);
  if (hp) return { referenceNo: referenceNo() };
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < 20_000) throw apiError('too_fast');

  const parsed = applicationSchema.safeParse(payload);
  if (!parsed.success) {
    throw apiError('invalid', { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  const p = parsed.data;
  const cat = categories.find((c) => c.id === p.categoryId);
  if (!cat) throw apiError('unknown_category');

  const given = new Set(files.map((f) => f.slot));
  const allowed = new Set(allowedSlots(cat));
  if (files.some((f) => !allowed.has(f.slot))) throw apiError('invalid_file');
  const missing = requiredSlots(cat, {
    ownerIdType: p.owner.idType, registered: p.business.registered, conditionalDocs: p.conditionalDocs,
  }).filter((s) => !given.has(s));
  if (missing.length) throw apiError('missing_documents', { slots: missing });

  for (const { slot } of files) {
    onFileStatus(slot, 'uploading');
    await wait(120);
    onFileStatus(slot, 'done');
  }
  await wait(250);
  const ref = referenceNo();
  const plan = catalog().find((c) => c.id === p.categoryId).plans[p.planKey];
  saveApplication({
    referenceNo: ref,
    status: 'submitted',
    createdAt: new Date().toISOString(),
    payload: p,
    priceAtSubmission: plan.price,
    planSnapshot: plan,
    documents: files.map(({ slot, file }) => ({ slot, name: file.name, mime: file.type, size: file.size })),
  });
  await saveFiles(ref, files);
  return { referenceNo: ref };
}
