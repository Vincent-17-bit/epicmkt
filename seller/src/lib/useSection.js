import { useCallback, useMemo, useState } from "react";
import { errorMessage } from "./errors.js";
import { useDirty } from "./guard.jsx";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Edit / Save / Cancel state for one card.
 * initial: the saved values. validate(draft) -> { field: message }. save(draft) -> promise.
 */
export function useSection({ id, initial, validate = () => ({}), save, isDirty, startEditing = false }) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const dirty = editing && (isDirty ? isDirty(draft, initial) : !same(draft, initial));
  useDirty(id, dirty);

  const errors = useMemo(() => (editing ? validate(draft) : {}), [editing, draft, validate]);
  const hasErrors = Object.keys(errors).length > 0;

  const start = useCallback(() => {
    setDraft(initial);
    setError("");
    setShowErrors(false);
    setEditing(true);
  }, [initial]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(initial);
    setError("");
    setShowErrors(false);
  }, [initial]);

  const set = useCallback((key, value) => setDraft((d) => ({ ...d, [key]: value })), []);

  const submit = useCallback(async () => {
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await save(draft);
      setEditing(false);
      setShowErrors(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [draft, hasErrors, save]);

  return { editing, draft, set, setDraft, dirty, saving, error, errors: dirty || showErrors ? errors : {}, allErrors: errors, hasErrors, start, cancel, submit, setError };
}
