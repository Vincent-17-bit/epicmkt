import { useState } from "react";
import { ITEM_PRICE_TYPES, emptyItemForm, formFromItem, validateItemForm, DB_AVAILABILITY, AVAILABILITY_OPTIONS } from "@epicmkt/shared";
import Modal from "./Modal.jsx";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import styles from "./catalog.module.css";

const TYPE_LABELS = { fixed: "Fixed price", from: "Starting from", range: "Price range", free: "Free", contact: "Contact for price" };
const AVAIL = AVAILABILITY_OPTIONS.filter((o) => DB_AVAILABILITY.includes(o.key));

export default function ItemDialog({ open, item, onClose, onSave }) {
  const [form, setForm] = useState(() => (item ? formFromItem(item) : emptyItemForm()));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const priced = ["fixed", "from", "range"].includes(form.priceType);

  const submit = async (e) => {
    e.preventDefault();
    const check = validateItemForm(form);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setError("");
    setBusy(true);
    try {
      await onSave(check.value);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, input) => (
    <div className={ui.field}>
      <label className={styles.stack}>
        <span className={ui.label}>{label}</span>
        {input}
      </label>
      {errors[key] && <span className={ui.error} role="alert">{errors[key]}</span>}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={item ? "Edit item" : "Add item"} labelId="item-title" wide>
      <form className={styles.form} onSubmit={submit} noValidate>
        {field("name", "Name", <input className={ui.input} value={form.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} maxLength={120} />)}
        {field("description", "Description", <textarea className={ui.input} value={form.description} onChange={set("description")} maxLength={2000} />)}
        {field("section", "Section", <input className={ui.input} value={form.section} onChange={set("section")} maxLength={60} />)}
        {field("priceType", "Price type", (
          <select className={ui.input} value={form.priceType} onChange={set("priceType")}>
            {ITEM_PRICE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        ))}
        {priced && field("price", form.priceType === "range" ? "Lowest price (KES)" : "Price (KES)", <input className={ui.input} inputMode="decimal" value={form.price} onChange={set("price")} aria-invalid={Boolean(errors.price)} />)}
        {form.priceType === "range" && field("priceMax", "Highest price (KES)", <input className={ui.input} inputMode="decimal" value={form.priceMax} onChange={set("priceMax")} aria-invalid={Boolean(errors.priceMax)} />)}
        {priced && field("salePrice", "Sale price (KES, optional)", <input className={ui.input} inputMode="decimal" value={form.salePrice} onChange={set("salePrice")} aria-invalid={Boolean(errors.salePrice)} />)}
        {field("unit", "Unit (optional, such as per cut)", <input className={ui.input} value={form.unit} onChange={set("unit")} maxLength={30} />)}
        {field("availability", "Availability", (
          <select className={ui.input} value={form.availability} onChange={set("availability")}>
            {AVAIL.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ))}
        {!item && <p className={styles.hint}>New items are saved as drafts. Use Show when you are ready for customers to see them.</p>}
        {error && <p className={ui.error} role="alert">{error}</p>}
        <div className={styles.formFoot}>
          <button type="button" className={styles.ghost} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.primary} disabled={busy}>{item ? "Save changes" : "Add item"}</button>
        </div>
      </form>
    </Modal>
  );
}
