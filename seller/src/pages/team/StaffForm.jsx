import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseSpecialties, promoErrorMessage, validateStaffDraft } from "@epicmkt/shared";
import { promo } from "../../api/promo/index.js";
import { Button, Dialog, Field, UpgradePrompt, inputClass } from "../../components/ui.jsx";
import { toast } from "../../components/toast.js";
import { IMAGE_ACCEPT, imageErrorMessage, processImage } from "../../lib/imagePipeline.js";
import { formatKes } from "../../lib/time.js";
import styles from "./team.module.css";

const blank = () => ({ name: "", role: "", specialties: "", service_ids: [], photo: null });

export default function StaffForm({ open, member, items, plan, premium, global, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState(blank());
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setF(member
        ? { name: member.name, role: member.role ?? "", specialties: member.specialties.join(", "), service_ids: member.service_ids ?? [], photo: member.photo_path ? { path: member.photo_path, url: member.photo_url } : null }
        : blank());
      setErrors({});
    }
  }, [open, member]);

  const save = useMutation({
    mutationFn: (draft) => promo.saveStaff(member?.id ?? null, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast(member ? "Team member updated" : "Team member added");
      onClose();
    },
    onError: (e) => toast(promoErrorMessage(e, plan, global)),
  });

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    const draft = {
      name: f.name,
      role: f.role,
      specialties: parseSpecialties(f.specialties),
      photo_path: f.photo?.path ?? null,
      photo_url: f.photo?.url ?? null,
      ...(premium ? { service_ids: f.service_ids } : {}),
    };
    const problems = validateStaffDraft(draft);
    setErrors(problems);
    if (!Object.keys(problems).length) save.mutate(draft);
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const img = await processImage(file);
      const up = await promo.uploadImage({ blob: img.blob, folder: "staff" });
      set("photo", { path: up.path, url: up.url });
    } catch (err) {
      toast(imageErrorMessage(err) ?? promoErrorMessage(err, plan, global));
    } finally {
      setUploading(false);
    }
  };

  const toggle = (id) => set("service_ids", f.service_ids.includes(id) ? f.service_ids.filter((x) => x !== id) : [...f.service_ids, id]);

  return (
    <Dialog
      open={open}
      title={member ? "Edit team member" : "Add team member"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="staff-form" disabled={save.isPending || uploading}>{save.isPending ? "Saving" : "Save"}</Button>
        </>
      }
    >
      <form id="staff-form" className={styles.form} onSubmit={submit} noValidate>
        <Field label="Photo (optional)">
          {(p) => (
            <div className={styles.form}>
              {f.photo?.url && <img className={styles.avatar} src={f.photo.url} alt="" />}
              <input {...p} className={inputClass} type="file" accept={IMAGE_ACCEPT} disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
            </div>
          )}
        </Field>
        <Field label="Name" error={errors.name}>{(p) => <input {...p} className={inputClass} value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />}</Field>
        <Field label="Role (optional)" error={errors.role}>{(p) => <input {...p} className={inputClass} value={f.role} maxLength={60} onChange={(e) => set("role", e.target.value)} />}</Field>
        <Field label="Specialties (optional)" error={errors.specialties} hint="Separate with commas, up to 10.">
          {(p) => <input {...p} className={inputClass} value={f.specialties} onChange={(e) => set("specialties", e.target.value)} />}
        </Field>
        {premium ? (
          <Field label="Services they offer" hint="Pick from your items.">
            {() => (
              <div className={styles.picker}>
                {items.map((i) => (
                  <label key={i.id} className={styles.pick}>
                    <input type="checkbox" checked={f.service_ids.includes(i.id)} onChange={() => toggle(i.id)} />
                    <span>{i.name}</span>
                    <span className={styles.meta}>{formatKes(i.price)}</span>
                  </label>
                ))}
                {!items.length && <p className={styles.meta}>Add items first to link services.</p>}
              </div>
            )}
          </Field>
        ) : (
          <UpgradePrompt>Linking services to each team member is a Premium feature.</UpgradePrompt>
        )}
      </form>
    </Dialog>
  );
}
