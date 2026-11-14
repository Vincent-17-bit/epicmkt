# Category ids named in source code (found by the conformance suite, Prompt 11.4)

Rule: no category name is hard-coded in source outside data and tests. Four files break it today. The suite lists them in
`shared/src/conformance/allowlist.js` so the build stays green, with a reason each. Each belongs to another group; none was changed here.

| File | Names | What to do | Owner |
|---|---|---|---|
| `shared/src/contracts/placement.js` | 19 categories | Move "which departments a shop category shows first" into the departments data (`departments.category_ids`). | Departments (Prompt 2.x) |
| `shared/src/seller/limits.js` | `barbershop`, `salon-beauty`, `gym-fitness` | Move the per-category item limits to the plans data (`category_plans`). Prompt 11.5 adds the plan-limit fields to carry this. | Plans |
| `shared/src/types/restrictions.js` | `chemist`, `agrovet` | Mirror of the database rule `product_types.restricted_to`; read the rule from the type instead of repeating it. | Restrictions (Prompt 2.3) |
| `backend/src/store.js` | `chemist`, `barbershop`, `agrovet` | Demo data for the local mock API; may stay, remove from the list once it is under a `data/` folder. | Backend mock |

When one is fixed, delete its line from `ALLOWED_CATEGORY_NAME_FILES`; the scan then protects it.
