// A small memory of what the home page has shown lately, kept on the device, so what appears next favours what has
// not been seen. It stores one timestamp per id (stores and products in separate namespaces) and forgets the oldest
// once it is full, so it can never grow without bound however many products a marketplace has.

export const SEEN_KEY = "epicmkt.seen.v1";
export const SEEN_MAX = 600;

const safeStorage = () => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

const read = (storage, key) => {
  try {
    const parsed = JSON.parse(storage?.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, at]) => Number.isFinite(at)));
  } catch {
    return {};
  }
};

export function createSeen({ storage = safeStorage(), key = SEEN_KEY, max = SEEN_MAX, now = Date.now } = {}) {
  let entries = read(storage, key);

  const persist = () => {
    try {
      storage?.setItem(key, JSON.stringify(entries));
    } catch {
      // Private mode or a full disk: the memory still works for this visit.
    }
  };

  return {
    /** When this id was last shown, or 0 if it never was (or has been forgotten). */
    lastSeen: (namespace, id) => entries[`${namespace}:${id}`] ?? 0,

    /** Records that these ids were just shown. Everything in one call shares one timestamp. */
    mark(namespace, ids) {
      const list = [...new Set(ids)].filter((id) => id != null && id !== "");
      if (!list.length) return;
      const at = now();
      for (const id of list) entries[`${namespace}:${id}`] = at;
      const keys = Object.keys(entries);
      if (keys.length > max) {
        const keep = keys.sort((a, b) => entries[b] - entries[a]).slice(0, max);
        entries = Object.fromEntries(keep.map((k) => [k, entries[k]]));
      }
      persist();
    },

    clear() {
      entries = {};
      try {
        storage?.removeItem(key);
      } catch {
        // nothing to clear
      }
    }
  };
}

let shared;

/** The one memory the app uses. Created on first use so tests and server rendering never touch storage early. */
export const seenMemory = () => (shared ??= createSeen());
