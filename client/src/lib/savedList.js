// The buyer's Saved list, kept on this device. It is a pure module in the style of lib/seen.js: createSavedList() takes the storage,
// the key, a clock and the cap, so tests never touch the real thing. The one rule above all others: the list changes only when the
// buyer changes it. Nothing here expires, evicts or cleans up, and nothing outside this file writes the key.

export const SAVED_KEY = "epicmkt.saved.v1";
export const SAVED_MAX = 200;
const VERSION = 1;

const safeStorage = () => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export const lineKey = (itemId, optionParam = "") => `${itemId}|${optionParam || ""}`;

const text = (v) => (typeof v === "string" && v ? v : "");

// An entry we understand, or null. Invalid ones are dropped in memory only; they are never written back by a read.
function clean(raw) {
  if (!raw || typeof raw !== "object") return null;
  const itemId = text(raw.itemId);
  const businessId = text(raw.businessId);
  const qty = Number(raw.qty);
  if (!itemId || !businessId || !Number.isFinite(qty) || qty <= 0) return null;
  const optionParam = text(raw.optionParam);
  const snap = raw.snap && typeof raw.snap === "object" ? raw.snap : {};
  const savedAt = Number.isFinite(raw.savedAt) ? raw.savedAt : 0;
  return {
    key: lineKey(itemId, optionParam),
    itemId,
    businessId,
    businessSlug: text(raw.businessSlug),
    optionParam,
    optionLabel: text(raw.optionLabel),
    kind: raw.kind === "service" ? "service" : "product",
    qty,
    savedAt,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : savedAt,
    snap
  };
}

// What is in storage right now. Never throws.
function readStored(storage, key, backupKey) {
  let rawText = null;
  try {
    rawText = storage?.getItem(key) ?? null;
  } catch {
    return { entries: [], sentAt: {}, readOnly: false };
  }
  if (rawText == null) return { entries: [], sentAt: {}, readOnly: false };
  let parsed;
  try {
    parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
  } catch {
    // Corrupt: keep one copy of the text for recovery (never overwriting an earlier backup), then start empty.
    try {
      if (storage.getItem(backupKey) == null) storage.setItem(backupKey, rawText);
    } catch {
      // nowhere to back it up; carry on
    }
    return { entries: [], sentAt: {}, readOnly: false };
  }
  const seen = new Set();
  const entries = (Array.isArray(parsed.entries) ? parsed.entries : []).map(clean).filter((e) => e && !seen.has(e.key) && seen.add(e.key));
  const sentAt = parsed.sentAt && typeof parsed.sentAt === "object" && !Array.isArray(parsed.sentAt) ? { ...parsed.sentAt } : {};
  // Written by a newer build: read what we understand, never write, so an older cached build cannot destroy it.
  return { entries, sentAt, readOnly: Number(parsed.v) > VERSION };
}

export function createSavedList({ storage = safeStorage(), key = SAVED_KEY, now = Date.now, max = SAVED_MAX, target = null } = {}) {
  const backupKey = `${key}.bak`;
  const first = readStored(storage, key, backupKey);
  let entries = first.entries;
  let sentAt = first.sentAt;
  let readOnly = first.readOnly;
  let writeFailed = false;
  // True while memory holds changes storage does not (a failed write): memory is then the truth, not storage.
  let ahead = false;
  let persistAsked = false;
  let snapshot;
  const listeners = new Set();

  const buildSnapshot = () => {
    snapshot = { entries, count: entries.length, sentAt, readOnly, writeFailed };
  };
  buildSnapshot();

  const notify = () => {
    buildSnapshot();
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        // a listener must never break the list
      }
    }
  };

  // Re-read storage so a change made in another tab is the base for this one.
  const refresh = () => {
    if (ahead) return;
    const fresh = readStored(storage, key, backupKey);
    entries = fresh.entries;
    sentAt = fresh.sentAt;
    readOnly = fresh.readOnly;
  };

  const write = () => {
    if (readOnly) return;
    try {
      if (!storage) throw new Error("no storage");
      storage.setItem(key, JSON.stringify({ v: VERSION, updatedAt: now(), entries, sentAt }));
      ahead = false;
      writeFailed = false;
      if (!persistAsked) {
        persistAsked = true;
        try {
          navigator.storage?.persist?.()?.catch?.(() => {});
        } catch {
          // the answer is ignored
        }
      }
    } catch {
      ahead = true;
      writeFailed = true;
    }
  };

  // Read-modify-write: apply the change to a fresh copy, write it, tell subscribers. `change` returns the result.
  const mutate = (change) => {
    refresh();
    const result = change();
    write();
    notify();
    return result;
  };

  const indexOf = (k) => entries.findIndex((e) => e.key === k);

  const api = {
    list: () => entries,
    count: () => entries.length,
    // With no option given: any line of this item. With one (even ""): exactly that line.
    has: (itemId, optionParam) => (optionParam === undefined ? entries.some((e) => e.itemId === itemId) : indexOf(lineKey(itemId, optionParam)) >= 0),
    get: (k) => entries.find((e) => e.key === k) ?? null,

    add(input) {
      return mutate(() => {
        const e = clean({ ...input, savedAt: input.savedAt ?? now(), updatedAt: now() });
        if (!e) return { ok: false, reason: "invalid" };
        const at = indexOf(e.key);
        if (at >= 0) {
          entries = entries.map((x, i) => (i === at ? { ...x, updatedAt: now() } : x));
          return { ok: true, added: false, entry: entries[at] };
        }
        if (entries.length >= max) return { ok: false, reason: "full" };
        entries = [e, ...entries];
        return { ok: true, added: true, entry: e };
      });
    },

    remove(k) {
      return mutate(() => {
        const at = indexOf(k);
        if (at < 0) return null;
        const entry = entries[at];
        entries = entries.filter((_, i) => i !== at);
        return { entry, position: at };
      });
    },

    restore(entry, position = 0) {
      return mutate(() => {
        const e = clean(entry);
        if (!e || indexOf(e.key) >= 0) return { ok: false, reason: "exists" };
        if (entries.length >= max) return { ok: false, reason: "full" };
        const next = entries.slice();
        next.splice(Math.max(0, Math.min(position, next.length)), 0, e);
        entries = next;
        return { ok: true };
      });
    },

    setQty(k, qty) {
      return mutate(() => {
        const at = indexOf(k);
        const n = Number(qty);
        if (at < 0 || !Number.isFinite(n) || n <= 0) return false;
        entries = entries.map((e, i) => (i === at ? { ...e, qty: n, updatedAt: now() } : e));
        return true;
      });
    },

    // Choosing an option for a line. If that option's line already exists, it stays and the old line goes.
    setOption(k, optionParam, optionLabel = "", snap) {
      return mutate(() => {
        const at = indexOf(k);
        if (at < 0) return null;
        const to = lineKey(entries[at].itemId, optionParam);
        const target = indexOf(to);
        if (target >= 0 && target !== at) {
          entries = entries.filter((_, i) => i !== at);
          return { key: to, merged: true };
        }
        entries = entries.map((e, i) => (i === at ? { ...e, key: to, optionParam: optionParam || "", optionLabel: optionLabel || "", snap: snap ?? e.snap, updatedAt: now() } : e));
        return { key: to, merged: false };
      });
    },

    // Used by "Remove all"; returns what was there so the buyer can undo.
    clear() {
      return mutate(() => {
        const was = entries;
        entries = [];
        return was;
      });
    },

    restoreAll(list) {
      return mutate(() => {
        const have = new Set(entries.map((e) => e.key));
        const back = (list ?? []).map(clean).filter((e) => e && !have.has(e.key));
        entries = [...back, ...entries].slice(0, Math.max(max, 0));
        return true;
      });
    },

    markSent(businessId, at = now()) {
      return mutate(() => {
        sentAt = { ...sentAt, [businessId]: at };
      });
    },
    sentAt: (businessId) => sentAt[businessId] ?? 0,

    status: () => ({ readOnly, writeFailed }),
    getSnapshot: () => snapshot,
    refresh() {
      refresh();
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };

  // Another tab changed the list: pick it up.
  if (target?.addEventListener) {
    target.addEventListener("storage", (e) => {
      if (e.key === null || e.key === key) api.refresh();
    });
  }

  return api;
}

let shared;

/** The one list the app uses. Created on first use so tests and server rendering never touch storage early. */
export const savedList = () => (shared ??= createSavedList({ target: typeof window === "undefined" ? null : window }));
