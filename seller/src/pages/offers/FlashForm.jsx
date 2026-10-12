import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { validateFlashDraft, promoErrorMessage, salePrice, discountLabel } from "@epicmkt/shared";
import { promo } from "../../api/promo/index.js";
import { Button, Dialog, Field, inputClass } from "../../components/ui.jsx";
import { toast } from "../../components/toast.js";
import { formatKes, fromEatInput, nowEatInput } from "../../lib/time.js";
import styles from "./offers.module.css";

const QUICK = [["1 hour", 60], ["3 hours", 180], ["6 hours", 360], ["24 hours", 1440]];

const blank = () => ({ item_id: "", discount_type: "percent", discount_value: "", ends: nowEatInput(180), on_end: "keep" });

export default function FlashForm({ open, items, plan, global, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState(blank());
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setF(blank());
      setErrors({});
    }
  }, [open]);

  const save = useMutation({
    mutationFn: (draft) => promo.createFlash(draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flash"] });
      qc.invalidateQueries({ queryKey: ["usage"] });
      toast("Flash sale started");
      onClose();
    },
    onError: (e) => toast(promoErrorMessage(e, plan, global)),
  });

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const item = items.find((i) => i.id === f.item_id);
  const preview = item && f.discount_value !== "" && !Number.isNaN(Number(f.discount_value)) ? salePrice(item.price, f.discount_type, f.discount_value) : null;

  const submit = (e) => {
    e.preventDefault();
    const draft = { item_id: f.item_id, discount_type: f.discount_type, discount_value: f.discount_value, ends_at: fromEatInput(f.ends), on_end: f.on_end };
    const problems = validateFlashDraft(draft, { items });
    setErrors(problems);
    if (!Object.keys(problems).length) save.mutate(draft);
  };

  return (
    <Dialog
      open={open}
      title="New flash sale"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="flash-form" disabled={save.isPending}>{save.isPending ? "Starting" : "Start flash sale"}</Button>
        </>
      }
    >
      <form id="flash-form" className={styles.form} onSubmit={submit} noValidate>
        <Field label="Item" error={errors.item_id}>
          {(p) => (
            <select {...p} className={inputClass} value={f.item_id} onChange={(e) => set("item_id", e.target.value)}>
              <option value="">Choose an item</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({formatKes(i.price)})</option>)}
            </select>
          )}
        </Field>
        <div className={styles.row}>
          <div className={styles.radios} role="radiogroup" aria-label="Discount type">
            <label className={styles.radio}><input type="radio" name="ftype" checked={f.discount_type === "percent"} onChange={() => set("discount_type", "percent")} />Percent off</label>
            <label className={styles.radio}><input type="radio" name="ftype" checked={f.discount_type === "kes"} onChange={() => set("discount_type", "kes")} />KES off</label>
          </div>
          <Field label={f.discount_type === "percent" ? "Percent (1 to 90)" : "KES off"} error={errors.discount_value}>
            {(p) => <input {...p} className={inputClass} inputMode="numeric" value={f.discount_value} onChange={(e) => set("discount_value", e.target.value)} />}
          </Field>
        </div>
        {preview !== null && item && (
          <p className={styles.price}>
            {discountLabel(f.discount_type, f.discount_value)}: <span className={styles.was}>{formatKes(item.price)}</span> {formatKes(preview)}
          </p>
        )}
        <Field label="Ends (Nairobi time)" error={errors.ends_at}>
          {(p) => (
            <div className={styles.form}>
              <input {...p} className={inputClass} type="datetime-local" value={f.ends} onChange={(e) => set("ends", e.target.value)} />
              <div className={styles.quick}>
                {QUICK.map(([label, mins]) => <Button key={label} size="sm" onClick={() => set("ends", nowEatInput(mins))}>{label}</Button>)}
              </div>
            </div>
          )}
        </Field>
        <div className={styles.radios} role="radiogroup" aria-label="When the sale ends">
          <label className={styles.radio}><input type="radio" name="onend" checked={f.on_end === "keep"} onChange={() => set("on_end", "keep")} />Keep the item listed</label>
          <label className={styles.radio}><input type="radio" name="onend" checked={f.on_end === "unlist"} onChange={() => set("on_end", "unlist")} />Unlist the item</label>
        </div>
        <p className={styles.meta}>The sale starts as soon as you save it.</p>
      </form>
    </Dialog>
  );
}
