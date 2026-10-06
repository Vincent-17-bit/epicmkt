import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { devTools } from "../../api/applications/index.js";
import styles from "./devpanel.module.css";

export default function PricingEditor({ category }) {
  const qc = useQueryClient();
  const [tools, setTools] = useState(null);
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState("standard");
  const [draft, setDraft] = useState({});

  useEffect(() => {
    devTools?.().then(setTools);
  }, []);

  useEffect(() => {
    const p = category?.plans?.[plan];
    if (p) setDraft({ price: p.price, items: p.limits.items, b0: p.topBenefits[0], b1: p.topBenefits[1], b2: p.topBenefits[2] });
  }, [category?.id, plan, open]);

  if (!tools || !category) return null;

  const apply = () => {
    tools.setPlanOverride(category.id, plan, {
      price: Number(draft.price),
      items: Number(draft.items),
      topBenefits: [draft.b0, draft.b1, draft.b2]
    });
    qc.invalidateQueries({ queryKey: ["catalog-pricing"] });
  };
  const reset = () => {
    tools.resetPricing();
    qc.invalidateQueries({ queryKey: ["catalog-pricing"] });
  };
  const field = (k, label, type = "text") => (
    <label>
      {label}
      <input type={type} value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
    </label>
  );

  return (
    <aside className={styles.panel} aria-label="Pricing editor (development only)">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        Pricing editor
      </button>
      {open && (
        <div className={styles.body}>
          <p>{category.name}</p>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
          {field("price", "Price (KES)", "number")}
          {field("items", "Item limit", "number")}
          {field("b0", "Benefit 1")}
          {field("b1", "Benefit 2")}
          {field("b2", "Benefit 3")}
          <div className={styles.row}>
            <button type="button" onClick={apply}>Apply</button>
            <button type="button" onClick={reset}>Reset all</button>
          </div>
        </div>
      )}
    </aside>
  );
}
