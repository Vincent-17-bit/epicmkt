import { useCallback, useEffect, useRef, useState } from "react";
import { UNDO_MS, canUndoCommitted } from "./decisions.js";

/**
 * Holds each decision for a short window before it is sent, so Undo is real:
 * nothing reaches the applicant until the window closes. After that, only changes
 * that carry no message (verification) can be reversed.
 */
export function useDecisionUndo({ send, onCommitted, onFailed, onUndone, undoMs = UNDO_MS }) {
  const [pending, setPending] = useState([]);
  const [committed, setCommitted] = useState([]);
  const timers = useRef(new Map());
  const entries = useRef(new Map());
  const seq = useRef(0);
  const callbacks = useRef({});
  callbacks.current = { send, onCommitted, onFailed, onUndone };

  const commit = useCallback(async (id) => {
    const entry = entries.current.get(id);
    if (!entry) return;
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    entries.current.delete(id);
    setPending((list) => list.filter((e) => e.id !== id));
    try {
      const result = await callbacks.current.send(entry.request);
      const done = { ...entry, result, committedAt: Date.now() };
      setCommitted((list) => [done, ...list].slice(0, 20));
      callbacks.current.onCommitted?.(done);
    } catch (error) {
      callbacks.current.onFailed?.(entry, error);
    }
  }, []);

  const schedule = useCallback((entry) => {
    seq.current += 1;
    const id = seq.current;
    const full = { ...entry, id, expiresAt: Date.now() + undoMs };
    entries.current.set(id, full);
    setPending((list) => [...list, full]);
    timers.current.set(id, setTimeout(() => commit(id), undoMs));
    return full;
  }, [commit, undoMs]);

  const cancel = useCallback((id) => {
    const entry = entries.current.get(id);
    if (!entry) return null;
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    entries.current.delete(id);
    setPending((list) => list.filter((e) => e.id !== id));
    callbacks.current.onUndone?.(entry);
    return entry;
  }, []);

  /**
   * Z key: cancel the newest held decision. If none is held, reverse the newest verification change.
   * Returns what happened so the caller can say so.
   */
  const undoLast = useCallback(() => {
    const held = [...entries.current.values()].sort((a, b) => b.id - a.id)[0];
    if (held) return { kind: "cancelled", entry: cancel(held.id) };
    const last = committed.find((e) => !e.reverted);
    if (!last) return { kind: "none" };
    if (!canUndoCommitted(last)) return { kind: "locked", entry: last };
    setCommitted((list) => list.map((e) => (e.id === last.id ? { ...e, reverted: true } : e)));
    const request = {
      applicationId: last.request.applicationId,
      action: "set_verification",
      verificationLevel: last.previousVerification,
      channels: { sms: false, email: false, inApp: false },
      preview: false,
    };
    schedule({ ...last, request, label: `Revert verification on ${last.name}`, revert: true });
    return { kind: "reverted", entry: last };
  }, [cancel, committed, schedule]);

  // Leaving the page must not drop a decision the reviewer already made.
  useEffect(() => () => {
    for (const id of [...entries.current.keys()]) commit(id);
  }, [commit]);

  return { pending, committed, schedule, cancel, undoLast, commit };
}
