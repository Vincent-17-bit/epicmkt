import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { WEEKDAYS, promoErrorMessage, validateSlotDraft } from "@epicmkt/shared";
import { promo } from "../../api/promo/index.js";
import { Button, Dialog, Field, inputClass } from "../../components/ui.jsx";
import { toast } from "../../components/toast.js";
import styles from "./team.module.css";

const blank = (day = 1) => ({ day_of_week: day, start_time: "07:00", end_time: "08:00", class_name: "", staff_id: "" });

export default function SlotForm({ open, slot, day, slots, staff, plan, global, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState(blank());
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setF(slot ? { day_of_week: slot.day_of_week, start_time: slot.start_time.slice(0, 5), end_time: slot.end_time.slice(0, 5), class_name: slot.class_name, staff_id: slot.staff_id ?? "" } : blank(day));
      setErrors({});
    }
  }, [open, slot, day]);

  const mutate = useMutation({
    mutationFn: (draft) => promo.saveSlot(slot?.id ?? null, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["slots"] });
      toast(slot ? "Class updated" : "Class added");
      onClose();
    },
    onError: (e) => toast(promoErrorMessage(e, plan, global)),
  });

  const remove = useMutation({
    mutationFn: () => promo.deleteSlot(slot.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["slots"] });
      toast("Class deleted");
      onClose();
    },
    onError: (e) => toast(promoErrorMessage(e, plan, global)),
  });

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    const draft = { ...f, day_of_week: Number(f.day_of_week), staff_id: f.staff_id || null, id: slot?.id };
    const problems = validateSlotDraft(draft, slots, staff);
    setErrors(problems);
    if (!Object.keys(problems).length) mutate.mutate(draft);
  };

  return (
    <Dialog
      open={open}
      title={slot ? "Edit class" : "Add class"}
      onClose={onClose}
      footer={
        <>
          {slot && <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>Delete</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="slot-form" disabled={mutate.isPending}>{mutate.isPending ? "Saving" : "Save"}</Button>
        </>
      }
    >
      <form id="slot-form" className={styles.form} onSubmit={submit} noValidate>
        <Field label="Class" error={errors.class_name}>{(p) => <input {...p} className={inputClass} value={f.class_name} maxLength={80} onChange={(e) => set("class_name", e.target.value)} />}</Field>
        <Field label="Day" error={errors.day_of_week}>
          {(p) => <select {...p} className={inputClass} value={f.day_of_week} onChange={(e) => set("day_of_week", e.target.value)}>{WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>}
        </Field>
        <div className={styles.row}>
          <Field label="Starts" error={errors.start_time}>{(p) => <input {...p} className={inputClass} type="time" value={f.start_time} onChange={(e) => set("start_time", e.target.value)} />}</Field>
          <Field label="Ends" error={errors.end_time}>{(p) => <input {...p} className={inputClass} type="time" value={f.end_time} onChange={(e) => set("end_time", e.target.value)} />}</Field>
        </div>
        <Field label="Trainer" error={errors.staff_id}>
          {(p) => (
            <select {...p} className={inputClass} value={f.staff_id} onChange={(e) => set("staff_id", e.target.value)}>
              <option value="">No trainer</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
