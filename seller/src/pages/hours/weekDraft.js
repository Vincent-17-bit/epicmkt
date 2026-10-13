import { useCallback, useEffect, useState } from "react";
import { normalizeHours, hoursEqual, validateWeek, copyDayToAll } from "@epicmkt/shared/hours";
import { showToast } from "../../stores/toast.js";
import { isConflict, messageForError } from "./errors.js";

export function useWeekDraft(data, actions) {
  const [base, setBase] = useState(() => ({ hours: normalizeHours(data.hours), version: data.hours_version }));
  const [draft, setDraft] = useState(() => normalizeHours(data.hours));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = !hoursEqual(draft, base.hours);
  const newer = data.hours_version > base.version;
  const remoteDiffers = newer && !hoursEqual(data.hours, base.hours);
  const conflict = dirty && remoteDiffers && !saving;
  const validation = validateWeek(draft);

  useEffect(() => {
    if (!newer || saving) return;
    if (!dirty) {
      const h = normalizeHours(data.hours);
      setBase({ hours: h, version: data.hours_version });
      setDraft(h);
    } else if (!remoteDiffers) {
      setBase((b) => ({ ...b, version: data.hours_version }));
    }
  }, [newer, dirty, remoteDiffers, saving, data.hours, data.hours_version]);

  const setDay = useCallback((key, day) => setDraft((d) => ({ ...d, [key]: day })), []);
  const reset = useCallback(() => {
    setDraft(base.hours);
    setError("");
  }, [base.hours]);

  const reload = useCallback(async () => {
    setError("");
    try {
      const fresh = await actions.reload();
      const h = normalizeHours(fresh.hours);
      setBase({ hours: h, version: fresh.hours_version });
      setDraft(h);
    } catch (e) {
      setError(messageForError(e));
    }
  }, [actions]);

  const undo = useCallback(
    async (previous, savedHours) => {
      setSaving(true);
      try {
        const r = await actions.saveWeek(previous, actions.current().hours_version);
        const restored = normalizeHours(r.hours);
        setBase({ hours: restored, version: r.hours_version });
        setDraft((d) => (hoursEqual(d, savedHours) ? restored : d));
        showToast("Previous hours restored");
      } catch (e) {
        showToast(isConflict(e) ? "Could not undo: hours changed on another device." : messageForError(e), { tone: "error" });
      } finally {
        setSaving(false);
      }
    },
    [actions]
  );

  const save = useCallback(async () => {
    if (!validation.ok || saving) return;
    setSaving(true);
    setError("");
    const previous = base.hours;
    try {
      let r;
      try {
        r = await actions.saveWeek(draft, base.version);
      } catch (e) {
        if (!isConflict(e)) throw e;
        const fresh = await actions.reload();
        if (!hoursEqual(fresh.hours, base.hours)) {
          setError("conflict");
          return;
        }
        r = await actions.saveWeek(draft, fresh.hours_version);
      }
      const saved = normalizeHours(r.hours);
      setBase({ hours: saved, version: r.hours_version });
      showToast("Hours saved", { duration: 8000, action: { label: "Undo", onClick: () => undo(previous, saved) } });
    } catch (e) {
      setError(isConflict(e) ? "conflict" : messageForError(e));
    } finally {
      setSaving(false);
    }
  }, [validation.ok, saving, base, draft, actions, undo]);

  const copyToAll = useCallback(
    (from) => {
      const before = draft;
      setDraft(copyDayToAll(draft, from));
      showToast("Copied to all days", { action: { label: "Undo", onClick: () => setDraft(before) } });
    },
    [draft]
  );

  return { draft, base, dirty, conflict: conflict || error === "conflict", saving, error: error === "conflict" ? "" : error, validation, setDay, reset, reload, save, copyToAll };
}
