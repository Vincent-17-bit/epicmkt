import { createPortal } from "react-dom";
import { formatKes } from "@epicmkt/shared";
import { stampDayYear } from "../../lib/time.js";

const price = (row) => (row && row.price_kes > 0 ? formatKes(row.price_kes, { decimals: 0 }) : "–");

export function sheetGroups(groups) {
  const out = new Map();
  for (const g of groups) {
    if (!g.active) continue;
    if (!out.has(g.grp)) out.set(g.grp, []);
    out.get(g.grp).push(g);
  }
  return [...out].map(([name, rows]) => ({ name, rows }));
}

export default function PlansSheet({ groups, now = new Date() }) {
  const sections = sheetGroups(groups);
  return createPortal(
    <div className="plans-sheet" aria-hidden="true">
      <h1>EpicMKT plans and prices</h1>
      <p>Monthly price per category. Updated {stampDayYear(now.toISOString())}.</p>
      {sections.map((s) => (
        <section key={s.name}>
          <h2>{s.name}</h2>
          <table>
            <thead><tr><th>Category</th><th>Standard</th><th>Premium</th></tr></thead>
            <tbody>
              {s.rows.map((g) => (
                <tr key={g.category_id}>
                  <td>{g.category_name}</td>
                  <td>{price(g.plans.standard)}</td>
                  <td>{price(g.plans.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>,
    document.body
  );
}
