// Every product type seeded in wave 5 (A24 to A28), and the loader that puts them in a database.
// The loader is idempotent: types are upserted by id (so a second run changes nothing and creates no duplicates), departments
// are created only when missing, and a type an admin has switched off (active = false) stays off.
import { FASHION } from "./fashion.mjs";
import { ELECTRONICS } from "./electronics.mjs";
import { CYBER } from "./cyber.mjs";
import { FOOD_HEALTH } from "./foodHealth.mjs";
import { HOME_AUTO } from "./homeAuto.mjs";
import { COVERAGE_FOOD } from "./coverageFood.mjs";
import { COVERAGE_HEALTH } from "./coverageHealth.mjs";
import { COVERAGE_HOME } from "./coverageHome.mjs";
import { COVERAGE_MORE } from "./coverageMore.mjs";
import { EXTRA_CATEGORY_LINKS } from "./categoryLinks.mjs";

export { EXTRA_CATEGORY_LINKS, FASHION, ELECTRONICS, CYBER, FOOD_HEALTH, HOME_AUTO, COVERAGE_FOOD, COVERAGE_HEALTH, COVERAGE_HOME, COVERAGE_MORE };

// A later file wins when two files describe the same id (the home and auto table is the more specific one for furniture and phone repair).
const merged = new Map();
for (const list of [FASHION, ELECTRONICS, CYBER, FOOD_HEALTH, HOME_AUTO, COVERAGE_FOOD, COVERAGE_HEALTH, COVERAGE_HOME, COVERAGE_MORE]) for (const type of list) merged.set(type.id, type);
// Existing types that also belong to the new shop categories (categoryLinks.mjs): added to their list, never taken away.
const linked = (type) => {
  const more = (EXTRA_CATEGORY_LINKS[type.id] ?? []).filter((id) => !type.categoryIds.includes(id));
  return more.length ? { ...type, categoryIds: [...type.categoryIds, ...more] } : type;
};
export const ALL_TYPES = Object.freeze([...merged.values()].map(linked));

const json = (v) => JSON.stringify(v);

/** Upsert the types. `db` is anything with query(text, values) (a pg Client or Pool). Returns { types, departments }. */
export async function seedProductTypes(db, types = ALL_TYPES) {
  let departments = 0;
  const wanted = [...new Set(types.map((t) => t.departmentId))];
  const have = new Set((await db.query("select id from public.departments where id = any($1)", [wanted])).rows.map((r) => r.id));
  for (const id of wanted.filter((d) => !have.has(d))) {
    await db.query("insert into public.departments (id, name, sort) values ($1, $2, 900) on conflict (id) do nothing", [id, id.replace(/-/g, " ").replace(/^./, (s) => s.toUpperCase())]);
    departments += 1;
  }
  for (const t of types) {
    await db.query(
      `insert into public.product_types (id, slug, name, kind, department_id, category_ids, restricted_to, quantity_mode, axes, spec_rows, extras)
       values ($1, $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)
       on conflict (id) do update set slug = excluded.slug, name = excluded.name, kind = excluded.kind, department_id = excluded.department_id,
         category_ids = excluded.category_ids, restricted_to = excluded.restricted_to, quantity_mode = excluded.quantity_mode,
         axes = excluded.axes, spec_rows = excluded.spec_rows, extras = excluded.extras`,
      [t.id, t.name, t.kind, t.departmentId, t.categoryIds, t.restrictedTo ?? [], t.quantityMode, json(t.axes ?? []), json(t.specRows ?? []), json(t.extras ?? {})]
    );
  }
  return { types: types.length, departments };
}
