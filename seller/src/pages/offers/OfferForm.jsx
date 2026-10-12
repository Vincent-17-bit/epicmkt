import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { validateOfferDraft, promoErrorMessage } from "@epicmkt/shared";
import { promo } from "../../api/promo/index.js";
import { Button, Dialog, Field, inputClass } from "../../components/ui.jsx";
import { toast } from "../../components/toast.js";
import { IMAGE_ACCEPT, imageErrorMessage, processImage } from "../../lib/imagePipeline.js";
import { formatKes, fromEatInput, nowEatInput, toEatInput } from "../../lib/time.js";
import styles from "./offers.module.css";

const blank = (premium) => ({
  title: "",
  description: "",
  discount_type: "percent",
  discount_value: "",
  starts: premium ? nowEatInput(0) : "",
  ends: nowEatInput(60 * 24 * 7),
  item_ids: [],
  banner: null,
});

const fromOffer = (o) => ({
  title: o.title,
  description: o.description ?? "",
  discount_type: o.discount_type ?? "percent",
  discount_value: o.discount_value ?? "",
  starts: toEatInput(o.starts_at),
  ends: toEatInput(o.ends_at),
  item_ids: o.item_ids ?? [],
  banner: o.banner_path ? { path: o.banner_path, url: o.banner_url ?? null } : null,
});

export default function OfferForm({ open, offer, items, plan, premium, global, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState(blank(premium));
  const [errors, setErrors] = useState({});
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setF(offer ? fromOffer(offer) : blank(premium));
      setErrors({});
      setQuery("");
    }
  }, [open, offer, premium]);

  const save = useMutation({
    mutationFn: (draft) => promo.saveOffer(offer?.id ?? null, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers"] });
      qc.invalidateQueries({ queryKey: ["usage"] });
      toast(offer ? "Offer updated" : "Offer created");
      onClose();
    },
    onError: (e) => toast(promoErrorMessage(e, plan, global)),
  });

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    const keepStart = offer && !premium ? offer.starts_at : null;
    const draft = {
      title: f.title,
      description: f.description,
      discount_type: f.discount_type,
      discount_value: f.discount_value,
      starts_at: premium || offer ? fromEatInput(f.starts) || keepStart : new Date(Date.now() - 60000).toISOString(),
      ends_at: fromEatInput(f.ends),
      item_ids: f.item_ids,
      banner_path: f.banner?.path ?? null,
    };
    const problems = validateOfferDraft(draft, { plan, items });
    setErrors(problems);
    if (!Object.keys(problems).length) save.mutate(draft);
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const img = await processImage(file);
      const up = await promo.uploadImage({ blob: img.blob, folder: "banners" });
      set("banner", { path: up.path, url: up.url });
    } catch (err) {
      toast(imageErrorMessage(err) ?? promoErrorMessage(err, plan, global));
    } finally {
      setUploading(false);
    }
  };

  const shown = items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id) => set("item_ids", f.item_ids.includes(id) ? f.item_ids.filter((x) => x !== id) : [...f.item_ids, id]);

  return (
    <Dialog
      open={open}
      title={offer ? "Edit offer" : "New offer"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="offer-form" disabled={save.isPending || uploading}>{save.isPending ? "Saving" : "Save offer"}</Button>
        </>
      }
    >
      <form id="offer-form" className={styles.form} onSubmit={submit} noValidate>
        <Field label="Title" error={errors.title}>{(p) => <input {...p} className={inputClass} value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />}</Field>
        <Field label="Description (optional)">{(p) => <textarea {...p} className={inputClass} value={f.description} onChange={(e) => set("description", e.target.value)} />}</Field>
        <div className={styles.row}>
          <div className={styles.radios} role="radiogroup" aria-label="Discount type">
            <label className={styles.radio}><input type="radio" name="dtype" checked={f.discount_type === "percent"} onChange={() => set("discount_type", "percent")} />Percent off</label>
            <label className={styles.radio}><input type="radio" name="dtype" checked={f.discount_type === "kes"} onChange={() => set("discount_type", "kes")} />KES off</label>
          </div>
          <Field label={f.discount_type === "percent" ? "Percent (1 to 90)" : "KES off"} error={errors.discount_value}>
            {(p) => <input {...p} className={inputClass} inputMode="numeric" value={f.discount_value} onChange={(e) => set("discount_value", e.target.value)} />}
          </Field>
        </div>
        <div className={styles.row}>
          {(premium || offer) && (
            <Field label="Starts (Nairobi time)" error={errors.starts_at} hint={premium ? "Premium can schedule ahead." : undefined}>
              {(p) => <input {...p} className={inputClass} type="datetime-local" value={f.starts} disabled={!premium} onChange={(e) => set("starts", e.target.value)} />}
            </Field>
          )}
          <Field label="Ends (Nairobi time)" error={errors.ends_at}>
            {(p) => <input {...p} className={inputClass} type="datetime-local" value={f.ends} onChange={(e) => set("ends", e.target.value)} />}
          </Field>
        </div>
        {!premium && !offer && <p className={styles.meta}>This offer starts as soon as you save it. Scheduling ahead is a Premium feature.</p>}
        <Field label="Linked items" error={errors.item_ids} hint="Leave empty to apply to your whole shop.">
          {() => (
            <div className={styles.form}>
              {items.length > 8 && <input className={inputClass} type="search" placeholder="Search items" aria-label="Search items" value={query} onChange={(e) => setQuery(e.target.value)} />}
              <div className={styles.picker}>
                {shown.map((i) => (
                  <label key={i.id} className={styles.pick}>
                    <input type="checkbox" checked={f.item_ids.includes(i.id)} onChange={() => toggle(i.id)} />
                    <span>{i.name}</span>
                    <span className={styles.pickPrice}>{formatKes(i.price)}</span>
                  </label>
                ))}
                {!shown.length && <p className={styles.meta}>No items found.</p>}
              </div>
            </div>
          )}
        </Field>
        <Field label="Banner image (optional)">
          {(p) => (
            <div className={styles.form}>
              {f.banner?.url && <img className={styles.banner} src={f.banner.url} alt="" />}
              <input {...p} className={inputClass} type="file" accept={IMAGE_ACCEPT} onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} />
              {f.banner && <Button size="sm" onClick={() => set("banner", null)}>Remove banner</Button>}
            </div>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
