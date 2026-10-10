import { useCallback, useEffect, useRef, useState } from "react";
import { blankItem, defaultKindFor, duplicateOf, planUsage, knownAttributes, DEFAULT_UNITS } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { validateItem } from "./schema.js";
import { useToasts } from "../ui/toasts.js";

export const AUTOSAVE_MS = 700;

const makeRow = (item, saved = item) => ({ id: item.id, item, saved, status: saved ? "saved" : "draft", version: 0, savedVersion: 0, errors: {}, message: "" });

// Items saved before item templates existed may carry business-level attribute keys. They are dropped, never rejected.
const withKnownAttributes = (item, fields) => {
  const attributes = knownAttributes(fields, item.attributes);
  return Object.keys(attributes).length === Object.keys(item.attributes ?? {}).length ? item : { ...item, attributes };
};

const isPristine = (r) => !r.saved && !r.item.name.trim() && r.item.price == null && !r.item.shortDescription && !r.item.description;
const needsSave = (r) => r.version !== r.savedVersion;

const move = (list, from, to) => {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

const withSorts = (rows) => rows.map((r, i) => (r.item.sort === i ? r : { ...r, item: { ...r.item, sort: i }, saved: r.saved ? { ...r.saved, sort: i } : r.saved }));

export function useCatalog() {
  const push = useToasts((s) => s.push);
  const [state, setState] = useState({ loading: true, error: null });
  const [ctx, setCtx] = useState(null);
  const [rows, setRows] = useState([]);
  const [sections, setSections] = useState([]);
  const [units, setUnits] = useState([]);
  const [limitHit, setLimitHit] = useState(false);
  const [focusRequest, setFocusRequest] = useState(null);

  const rowsRef = useRef([]);
  const ctxRef = useRef(null);
  const unitsRef = useRef([]);
  const timers = useRef(new Map());
  const inflight = useRef(new Map());
  const alive = useRef(true);
  const scheduleRef = useRef(() => {});

  const commit = useCallback((updater) => {
    const next = typeof updater === "function" ? updater(rowsRef.current) : updater;
    rowsRef.current = next;
    setRows(next);
    return next;
  }, []);
  const patchRow = useCallback((id, patch) => commit((rs) => rs.map((r) => (r.id === id ? (typeof patch === "function" ? patch(r) : { ...r, ...patch }) : r))), [commit]);
  const get = (id) => rowsRef.current.find((r) => r.id === id);

  const load = useCallback(async () => {
    setState({ loading: true, error: null });
    try {
      const [context, items, settings] = await Promise.all([api.getCatalogContext(), api.listItems(), api.getCatalogSettings()]);
      if (!alive.current) return;
      ctxRef.current = context;
      unitsRef.current = settings.units;
      setCtx(context);
      setSections(settings.sections);
      setUnits(settings.units);
      commit(items.map((i) => makeRow(i)));
      setState({ loading: false, error: null });
    } catch (e) {
      if (alive.current) setState({ loading: false, error: e });
    }
  }, [commit]);

  useEffect(() => {
    alive.current = true;
    load();
    const t = timers.current;
    return () => {
      alive.current = false;
      for (const id of t.values()) clearTimeout(id);
    };
  }, [load]);

  const rememberUnit = useCallback((unit) => {
    const clean = unit?.trim();
    if (!clean) return;
    const known = [...DEFAULT_UNITS, ...unitsRef.current];
    if (known.some((u) => u.toLowerCase() === clean.toLowerCase()) || unitsRef.current.length >= 10) return;
    const next = [...unitsRef.current, clean];
    unitsRef.current = next;
    setUnits(next);
    api.saveCatalogSettings({ units: next }).catch(() => {});
  }, []);

  const handleError = useCallback((id, e) => {
    if (e?.code === "item_limit_reached") {
      setLimitHit(true);
      patchRow(id, { status: "error", message: "Your plan is full. Remove an item or upgrade to add more." });
    } else if (e?.code === "invalid_value") {
      patchRow(id, { status: "error", errors: e.problems ?? {}, message: e.message || "Some values are not allowed." });
    } else {
      patchRow(id, { status: "error", message: "Could not save. Check your connection and try again." });
    }
  }, [patchRow]);

  const doSave = useCallback(async (id) => {
    const row = get(id);
    if (!row || !needsSave(row)) return;
    const itemFields = ctxRef.current?.category.itemFields ?? [];
    const item = withKnownAttributes(row.item, itemFields);
    const { version } = row;
    // A row that has never been saved waits for a usable name before anything else is checked.
    if (!row.saved && item.name.trim().length < 2) {
      patchRow(id, { status: "draft", errors: {}, message: "Add a name to save this row." });
      return;
    }
    const { ok, errors } = validateItem(item, { fields: itemFields });
    if (!ok) {
      patchRow(id, { status: "error", errors, message: "Fix the highlighted fields to save." });
      return;
    }
    patchRow(id, { status: "saving", errors: {}, message: "" });
    try {
      const out = row.saved ? await api.updateItem(id, item) : await api.createItem(item);
      let followUp = false;
      patchRow(id, (r) => {
        const unchanged = r.version === version;
        followUp = !unchanged;
        // The database is the authority for stock-driven status, price stamps and admin flags.
        const adopted = unchanged
          ? out
          : { ...r.item, availability: r.item.availability === item.availability ? out.availability : r.item.availability, hiddenByAdmin: out.hiddenByAdmin, adminHideReason: out.adminHideReason, removedByAdmin: out.removedByAdmin, priceConfirmedAt: out.priceConfirmedAt, updatedAt: out.updatedAt, createdAt: out.createdAt };
        return { ...r, item: adopted, saved: out, savedVersion: version, status: unchanged ? "saved" : "dirty", errors: {}, message: "" };
      });
      rememberUnit(item.unit);
      if (followUp) scheduleRef.current(id);
    } catch (e) {
      handleError(id, e);
    }
  }, [handleError, patchRow, rememberUnit]);

  const save = useCallback((id) => {
    if (timers.current.has(id)) { clearTimeout(timers.current.get(id)); timers.current.delete(id); }
    const prev = inflight.current.get(id) ?? Promise.resolve();
    const p = prev.then(() => doSave(id)).finally(() => { if (inflight.current.get(id) === p) inflight.current.delete(id); });
    inflight.current.set(id, p);
    return p;
  }, [doSave]);

  const schedule = useCallback((id) => {
    if (timers.current.has(id)) clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => { timers.current.delete(id); save(id); }, AUTOSAVE_MS));
  }, [save]);

  scheduleRef.current = schedule;

  const change = useCallback((id, patch) => {
    patchRow(id, (r) => {
      const itemFields = ctxRef.current?.category.itemFields ?? [];
      const item = withKnownAttributes({ ...r.item, ...patch }, itemFields);
      const { errors } = validateItem(item, { fields: itemFields });
      if (!r.saved && item.name.trim().length < 2) delete errors.name;
      return { ...r, item, version: r.version + 1, status: "dirty", errors, message: "" };
    });
    schedule(id);
  }, [patchRow, schedule]);

  const flushAll = useCallback(async () => {
    const pending = rowsRef.current.filter((r) => !isPristine(r) && (needsSave(r) || r.status === "error"));
    for (const r of pending) {
      if (r.status === "error" && !needsSave(r)) patchRow(r.id, (x) => ({ ...x, version: x.version + 1 }));
    }
    await Promise.all(pending.map((r) => save(r.id)));
    await Promise.all([...inflight.current.values()]);
    return !rowsRef.current.some((r) => !isPristine(r) && (r.status !== "saved" || needsSave(r)));
  }, [patchRow, save]);

  const retry = useCallback((id) => {
    patchRow(id, (r) => ({ ...r, version: r.version + 1, status: "dirty", message: "" }));
    return save(id);
  }, [patchRow, save]);

  const count = rows.filter((r) => r.saved).length;
  const usage = planUsage(count, ctx?.itemsLimit ?? null);

  const addRow = useCallback((overrides = {}) => {
    if (planUsage(rowsRef.current.filter((r) => r.saved).length, ctxRef.current?.itemsLimit ?? null).atLimit) {
      setLimitHit(true);
      return null;
    }
    const last = rowsRef.current[rowsRef.current.length - 1];
    const item = blankItem({ kind: defaultKindFor(ctxRef.current?.category.id), sort: rowsRef.current.length, section: last?.item.section ?? "", ...overrides });
    commit((rs) => [...rs, makeRow(item, null)]);
    setFocusRequest({ id: item.id, field: "name", n: Date.now() });
    return item.id;
  }, [commit]);

  const persistOrder = useCallback(async (changedIds) => {
    const targets = changedIds.map((id) => get(id)).filter((r) => r?.saved);
    if (!targets.length) return;
    await Promise.all(targets.map((r) => inflight.current.get(r.id)).filter(Boolean));
    try {
      await api.reorderItems(targets.map((r) => ({ id: r.id, sort: get(r.id).item.sort })));
    } catch {
      push({ message: "Could not save the new order. Reloading your list.", tone: "error" });
      load();
    }
  }, [load, push]);

  const moveRow = useCallback((id, toIndex) => {
    const from = rowsRef.current.findIndex((r) => r.id === id);
    if (from < 0 || toIndex < 0 || toIndex >= rowsRef.current.length || from === toIndex) return;
    const before = new Map(rowsRef.current.map((r) => [r.id, r.item.sort]));
    const next = commit(withSorts(move(rowsRef.current, from, toIndex)));
    persistOrder(next.filter((r) => before.get(r.id) !== r.item.sort).map((r) => r.id));
  }, [commit, persistOrder]);

  const remove = useCallback(async (id) => {
    const row = get(id);
    if (!row) return;
    if (timers.current.has(id)) { clearTimeout(timers.current.get(id)); timers.current.delete(id); }
    await (inflight.current.get(id) ?? Promise.resolve());
    const current = get(id);
    if (!current) return;
    const index = rowsRef.current.findIndex((r) => r.id === id);
    const restoreItem = current.saved;
    if (restoreItem) {
      try {
        await api.deleteItem(id);
      } catch {
        push({ message: `Could not delete “${current.item.name || "this row"}”. Try again.`, tone: "error" });
        return;
      }
    }
    commit((rs) => rs.filter((r) => r.id !== id));
    push({
      message: current.item.name.trim() ? `Deleted “${current.item.name.trim()}”.` : "Row removed.",
      actionLabel: "Undo",
      onAction: async () => {
        if (restoreItem) {
          try {
            const back = await api.restoreItem(restoreItem);
            commit((rs) => { const next = [...rs]; next.splice(Math.min(index, next.length), 0, makeRow(back)); return next; });
          } catch (e) {
            if (e?.code === "item_limit_reached") setLimitHit(true);
            push({ message: e?.code === "item_limit_reached" ? "Your plan is full, so this could not be restored." : "Could not restore it. Try again.", tone: "error" });
          }
        } else {
          commit((rs) => { const next = [...rs]; next.splice(Math.min(index, next.length), 0, current); return next; });
        }
      },
    });
  }, [commit, push]);

  const duplicate = useCallback(async (id) => {
    if (planUsage(rowsRef.current.filter((r) => r.saved).length, ctxRef.current?.itemsLimit ?? null).atLimit) {
      setLimitHit(true);
      return;
    }
    await save(id);
    const index = rowsRef.current.findIndex((r) => r.id === id);
    const source = get(id);
    if (!source || index < 0) return;
    const copy = duplicateOf(source.item, index + 1);
    const before = new Map(rowsRef.current.map((r) => [r.id, r.item.sort]));
    const row = { ...makeRow(copy, null), version: 1, status: "dirty" };
    const next = commit(withSorts([...rowsRef.current.slice(0, index + 1), row, ...rowsRef.current.slice(index + 1)]));
    setFocusRequest({ id: copy.id, field: "name", n: Date.now() });
    await save(copy.id);
    persistOrder(next.filter((r) => r.id !== copy.id && before.get(r.id) !== r.item.sort).map((r) => r.id));
  }, [commit, persistOrder, save]);

  const createFirst = useCallback(async (item) => {
    const out = await api.createItem({ ...item, sort: 0 });
    rememberUnit(item.unit);
    commit([makeRow(out)]);
    return out;
  }, [commit, rememberUnit]);

  const saveSections = useCallback(async (next) => {
    const out = await api.saveCatalogSettings({ sections: next });
    setSections(out.sections);
    return out.sections;
  }, []);
  const addSection = useCallback((name) => saveSections([...sections, name]), [saveSections, sections]);

  const any = (s) => rows.some((r) => r.status === s);
  const status = any("error") ? "error" : any("saving") || rows.some((r) => !isPristine(r) && needsSave(r) && r.status !== "draft") ? "saving" : "saved";
  const hasUnsaved = rows.some((r) => !isPristine(r) && (r.status !== "saved" || needsSave(r)));

  return {
    ...state, ctx, rows, sections, units, usage, status, hasUnsaved, limitHit, focusRequest,
    dismissLimit: () => setLimitHit(false),
    showLimit: () => setLimitHit(true),
    reload: load, change, addRow, remove, duplicate, moveRow, flushAll, retry, createFirst, addSection, saveSections, setFocusRequest,
  };
}
