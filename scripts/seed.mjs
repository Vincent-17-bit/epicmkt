import { createClient } from '@supabase/supabase-js';
import { categories } from '../client/src/data/categories.js';
import { planRows } from '../client/src/data/plans.seed.js';
import { legalDocs } from '../client/src/data/legal.js';

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

await check(
  `categories (${categories.length})`,
  db.from('categories').upsert(
    categories.map((c, i) => ({
      id: c.id,
      name: c.name,
      grp: c.group,
      icon: c.icon,
      tier: c.tier,
      sort: (i + 1) * 10,
      active: true,
      template: c.keyFields,
      extra_docs: c.extraDocs,
    })),
    { onConflict: 'id' },
  ),
);

const plans = categories.flatMap((c) => planRows(c.id, c.tier));
await check(`plans (${plans.length})`, db.from('plans').upsert(plans, { onConflict: 'category_id,plan_key' }));

await check(
  `legal docs (${legalDocs.length})`,
  db.from('legal_docs').upsert(
    legalDocs.map((d) => ({ key: d.key, version: d.version, title: d.title, body: d.body, key_points: d.keyPoints })),
    { onConflict: 'key' },
  ),
);
