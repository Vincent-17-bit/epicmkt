import { createClient } from '@supabase/supabase-js';
import { categories } from '../client/src/data/categories.js';
import { planRows } from '../client/src/config/plans.seed.js';
import { legalDocs } from '../client/src/data/legal/index.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in scripts/.env');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const check = async (label, request) => {
  const { error } = await request;
  if (error) {
    console.error(`${label} failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`${label} ok`);
};

// A category marked `draft` is created inactive with unpriced plans and then left alone: an admin reviews its document rules, sets the
// prices and opens it, and re-running the seed must not close it again (ignoreDuplicates).
const categoryRow = (c, i) => ({
  id: c.id,
  name: c.name,
  grp: c.group,
  icon: c.icon,
  tier: c.tier,
  sort: (i + 1) * 10,
  active: !c.draft,
  template: c.keyFields,
  extra_docs: c.extraDocs,
});
const live = categories.filter((c) => !c.draft);
const drafts = categories.filter((c) => c.draft);
const indexOf = (c) => categories.indexOf(c);

await check(`categories (${live.length})`, db.from('categories').upsert(live.map((c) => categoryRow(c, indexOf(c))), { onConflict: 'id' }));
if (drafts.length) {
  await check(`draft categories (${drafts.length})`, db.from('categories').upsert(drafts.map((c) => categoryRow(c, indexOf(c))), { onConflict: 'id', ignoreDuplicates: true }));
}

const plans = live.flatMap((c) => planRows(c.id, c.tier));
await check(`plans (${plans.length})`, db.from('plans').upsert(plans, { onConflict: 'category_id,plan_key' }));
const draftPlans = drafts.flatMap((c) => planRows(c.id, c.tier).map((r) => ({ ...r, price_kes: 0 })));
if (draftPlans.length) {
  await check(`draft plans (${draftPlans.length})`, db.from('plans').upsert(draftPlans, { onConflict: 'category_id,plan_key', ignoreDuplicates: true }));
}

await check(
  `legal docs (${legalDocs.length})`,
  db.from('legal_docs').upsert(
    legalDocs.map((d) => ({ key: d.key, version: d.version, title: d.title, body: d.body, key_points: d.keyPoints })),
    { onConflict: 'key' },
  ),
);
