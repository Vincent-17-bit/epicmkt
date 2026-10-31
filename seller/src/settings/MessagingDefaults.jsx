import { useEffect, useState } from "react";
import { Button } from "@epicmkt/ui";
import { CLOSURE_LABEL_MAX, CLOSURE_MESSAGE_MAX, CLOSURE_REASON_LIMIT, DEFAULT_CLOSURE_REASONS, GREETING_MAX, clone, renderGreeting } from "@epicmkt/shared";
import { useSettings } from "../state/settings.js";
import { closureReasonsSchema, greetingSchema, validateField } from "../lib/settingsSchema.js";
import { CommitField, Row, Section } from "./controls.jsx";
import styles from "./settings.module.css";

const SAMPLE = { item: "Fade and beard", price: "KES 300" };

export default function MessagingDefaults() {
  const m = useSettings((s) => s.settings.messaging);
  const update = useSettings((s) => s.update);
  const [draft, setDraft] = useState(m.whatsapp_greeting);

  return (
    <Section id="messaging" title="Messaging defaults" intro="Used when customers message you on WhatsApp and when you close for a while.">
      <Row label="WhatsApp greeting" hint="Use {item} and {price}. No links or phone numbers." stack>
        <CommitField label="Greeting" multiline rows={3} maxLength={GREETING_MAX} counter value={m.whatsapp_greeting} validate={(v) => validateField(greetingSchema, v)} liveError onDraft={setDraft} onCommit={(v) => update({ messaging: { whatsapp_greeting: v.trim() } })} />
        <p className={styles.preview} aria-live="polite" data-testid="greeting-preview">
          <strong>Preview</strong>
          {renderGreeting(draft, SAMPLE)}
        </p>
      </Row>
      <Row label="Closure reasons" hint={`Shown when you close temporarily. Up to ${CLOSURE_REASON_LIMIT}.`} stack>
        <Reasons list={m.closure_reasons} onSave={(list, message) => update({ messaging: { closure_reasons: list } }, message ? { message } : undefined)} />
      </Row>
    </Section>
  );
}

function Reasons({ list, onSave }) {
  const [rows, setRows] = useState(list);
  const [errors, setErrors] = useState({});
  useEffect(() => setRows(list), [list]);

  const check = (next) => {
    const r = closureReasonsSchema.safeParse(next);
    if (r.success) return {};
    const out = {};
    for (const issue of r.error.issues) out[`${issue.path[0]}.${issue.path[1] ?? "list"}`] = issue.message;
    return out;
  };
  const commit = (next, message) => {
    const found = check(next);
    setErrors(found);
    if (Object.keys(found).length === 0) onSave(next.map((r) => ({ ...r, label: r.label.trim(), message: r.message.trim() })), message);
  };
  const edit = (i, patch) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const add = () => {
    if (rows.length >= CLOSURE_REASON_LIMIT) return;
    const next = [...rows, { id: `r${Date.now().toString(36)}`, label: "", message: "" }];
    setRows(next);
    setErrors({});
  };
  const remove = (i) => {
    const next = rows.filter((_, n) => n !== i);
    setRows(next);
    commit(next, "Reason removed");
  };

  return (
    <div className={styles.page}>
      <ul className={styles.reasons} aria-label="Closure reasons">
        {rows.map((r, i) => (
          <li key={r.id} className={styles.reason}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={`reason-label-${r.id}`}>Reason {i + 1}</label>
              <input id={`reason-label-${r.id}`} className={styles.input} value={r.label} maxLength={CLOSURE_LABEL_MAX + 20} aria-invalid={errors[`${i}.label`] ? "true" : undefined} onChange={(e) => edit(i, { label: e.target.value })} onBlur={() => r.label.trim() !== "" && commit(rows)} />
              {errors[`${i}.label`] && <p className={styles.error} role="alert">{errors[`${i}.label`]}</p>}
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={`reason-msg-${r.id}`}>Message to customers</label>
              <input id={`reason-msg-${r.id}`} className={styles.input} value={r.message} maxLength={CLOSURE_MESSAGE_MAX + 20} aria-invalid={errors[`${i}.message`] ? "true" : undefined} onChange={(e) => edit(i, { message: e.target.value })} onBlur={() => r.label.trim() !== "" && commit(rows)} />
              {errors[`${i}.message`] && <p className={styles.error} role="alert">{errors[`${i}.message`]}</p>}
            </div>
            {rows.length > 1 && <button type="button" className={styles.linkBtn} onClick={() => remove(i)} aria-label={`Remove reason ${i + 1}`}>Remove</button>}
          </li>
        ))}
      </ul>
      {errors["list.list"] && <p className={styles.error} role="alert">{errors["list.list"]}</p>}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={add} disabled={rows.length >= CLOSURE_REASON_LIMIT}>Add a reason</Button>
        <button type="button" className={styles.linkBtn} onClick={() => { setRows(clone(DEFAULT_CLOSURE_REASONS)); setErrors({}); onSave(clone(DEFAULT_CLOSURE_REASONS), "Reset to defaults"); }}>Reset to defaults</button>
      </div>
    </div>
  );
}
