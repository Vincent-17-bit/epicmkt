import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { REPORT_REASONS } from "@epicmkt/shared";
import { reportBusiness } from "../api/index.js";
import { Button, Modal } from "@epicmkt/ui";
import styles from "./ReportDialog.module.css";

export default function ReportDialog({ business, open, onClose }) {
  const [form, setForm] = useState({ reason: "", message: "", contact: "" });
  const mutation = useMutation({ mutationFn: reportBusiness });

  useEffect(() => {
    if (open) {
      setForm({ reason: "", message: "", contact: "" });
      mutation.reset();
    }
  }, [open]);

  const fields = mutation.error?.fields ?? {};
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    mutation.mutate({ businessId: business.id, ...form });
  };

  return (
    <Modal open={open} aria-labelledby="report-title" onClose={onClose}>
      {mutation.isSuccess ? (
        <div className={styles.body}>
          <h2 id="report-title" className={styles.title}>
            Thanks for the report
          </h2>
          <p>We will review {business.name} and fix anything that is wrong.</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form className={styles.body} onSubmit={submit} noValidate>
          <h2 id="report-title" className={styles.title}>
            Report a problem
          </h2>
          <p className={styles.sub}>{business.name}</p>

          <label className={styles.field}>
            <span className={styles.label}>What is wrong?</span>
            <select className={styles.input} value={form.reason} onChange={set("reason")} aria-invalid={Boolean(fields.reason)}>
              <option value="">Choose a reason</option>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {fields.reason && <span className={styles.error}>{fields.reason}</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Details (optional)</span>
            <textarea className={styles.input} rows={4} maxLength={500} value={form.message} onChange={set("message")} aria-invalid={Boolean(fields.message)} />
            {fields.message && <span className={styles.error}>{fields.message}</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Your phone or email (optional)</span>
            <input className={styles.input} maxLength={80} value={form.contact} onChange={set("contact")} aria-invalid={Boolean(fields.contact)} />
            {fields.contact && <span className={styles.error}>{fields.contact}</span>}
          </label>

          {mutation.isError && !mutation.error?.fields && (
            <p className={styles.error} role="alert">
              Could not send your report. Try again.
            </p>
          )}

          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Sending" : "Send report"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
