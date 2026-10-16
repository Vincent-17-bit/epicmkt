import { useEffect, useState } from "react";
import { Button, Chip, Modal } from "../../components/index.js";
import s from "./applications.module.css";

const UNASSIGN = "__none__";

/**
 * Owner's "Assign to…" dialog: pick a reviewer (or return the applications to the pool) and confirm.
 * Reviewers do not see this: they use "Assign to me" and "Unassign" on the bulk bar, which is all their role allows.
 */
export default function BulkAssignDialog({ open, count, reviewers, me, busy, onClose, onConfirm }) {
  const [choice, setChoice] = useState(me ?? UNASSIGN);
  useEffect(() => { if (open) setChoice(reviewers.some((r) => r.id === me) ? me : (reviewers[0]?.id ?? UNASSIGN)); }, [open, me, reviewers]);
  const noun = count === 1 ? "application" : "applications";
  const target = choice === UNASSIGN ? null : reviewers.find((r) => r.id === choice);
  return (
    <Modal
      open={open} onClose={() => { if (!busy) onClose(); }} size="sm" title={`Assign ${count} ${noun}`}
      description="Assigning does not start the review or change the status. The person sees it under Assigned to Me."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => onConfirm(choice === UNASSIGN ? null : choice, target?.name ?? null)} data-autofocus>
            {choice === UNASSIGN ? `Unassign ${count} ${noun}` : `Assign to ${target?.id === me ? "me" : (target?.name ?? "them")}`}
          </Button>
        </>
      )}
    >
      <fieldset className={s.radioGroup}>
        <legend className="sr-only">Assign to</legend>
        {reviewers.map((r) => (
          <label key={r.id} className={s.radio}>
            <input type="radio" name="assignee" value={r.id} checked={choice === r.id} onChange={() => setChoice(r.id)} />
            <span className={s.radioText}>{r.id === me ? `${r.name} (you)` : r.name}</span>
            <Chip tone={r.role === "owner" ? "info" : "neutral"}>{r.role === "owner" ? "Owner" : "Reviewer"}</Chip>
          </label>
        ))}
        <label className={s.radio}>
          <input type="radio" name="assignee" value={UNASSIGN} checked={choice === UNASSIGN} onChange={() => setChoice(UNASSIGN)} />
          <span className={s.radioText}>Nobody (clear the assignee)</span>
        </label>
      </fieldset>
    </Modal>
  );
}
