import { useEffect, useState } from "react";
import { availabilityLabel } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { SelectInput } from "../ui/ui.jsx";
import styles from "./catalog.module.css";

const FIELD_LABELS = {
  name: "Name", price: "Price", price_max: "Highest price", price_type: "Price type", unit: "Unit", sale_price: "Sale price",
  availability: "Availability", stock_count: "Stock count", visible: "Visible to shoppers", hidden_by_admin: "Hidden by admin",
};
const ACTORS = { seller: "You", admin: "Admin", system: "System" };
const PRICE_TYPE = { fixed: "Fixed", from: "From", range: "Range", free: "Free", contact: "Contact for price" };

export function formatChange(field, value) {
  if (value === null || value === undefined || value === "") return "empty";
  if (["price", "price_max", "sale_price"].includes(field)) return `KSh ${Number(value).toLocaleString("en-KE")}`;
  if (field === "availability") return availabilityLabel(value);
  if (field === "price_type") return PRICE_TYPE[value] ?? value;
  if (field === "visible" || field === "hidden_by_admin") return value === "true" || value === true ? "Yes" : "No";
  return String(value);
}

const when = (iso) => new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(iso));

export function History({ catalog }) {
  const [list, setList] = useState(null);
  const [failed, setFailed] = useState(false);
  const [itemId, setItemId] = useState("");

  useEffect(() => {
    let live = true;
    setList(null);
    setFailed(false);
    api.listItemHistory({ itemId: itemId || undefined, limit: 200 }).then((h) => live && setList(h)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [itemId]);

  const names = new Map(catalog.rows.map((r) => [r.id, r.item.name]));
  const options = catalog.rows.filter((r) => r.saved).map((r) => ({ value: r.id, label: r.item.name }));

  return (
    <div>
      <div className={styles.historyFilter}>
        <label htmlFor="history-item">Show changes for</label>
        <SelectInput id="history-item" value={itemId} onChange={setItemId} options={options} placeholder="All items" />
      </div>
      {failed && <p role="alert" className={styles.errorText}>Could not load the history. Try again.</p>}
      {!failed && list === null && <p className={styles.muted}>Loading history…</p>}
      {list?.length === 0 && (
        <div className={styles.empty}><h3>No changes yet</h3><p className={styles.muted}>Changes to names, prices, availability and visibility are recorded here.</p></div>
      )}
      {list?.length > 0 && (
        <ul className={styles.history}>
          {list.map((h) => (
            <li key={h.id}>
              <div><strong>{names.get(h.item_id) ?? "Deleted item"}</strong> · {FIELD_LABELS[h.field] ?? h.field}</div>
              <div>{formatChange(h.field, h.old_value)} <span aria-label="changed to">→</span> {formatChange(h.field, h.new_value)}</div>
              <div className={styles.muted}>{when(h.created_at)} · {ACTORS[h.actor_role] ?? h.actor_role}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
