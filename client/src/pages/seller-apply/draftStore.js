const KEY = "epicmkt.apply.draft";
const DB = "epicmkt-apply-draft";

export function loadDraft() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {}
}

const open = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no_idb"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const run = async (mode, work) => {
  try {
    const db = await open();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction("files", mode);
      const out = work(tx.objectStore("files"));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return result;
  } catch {
    return undefined;
  }
};

export const saveDraftFile = (slot, file) => run("readwrite", (s) => s.put(file, slot));
export const removeDraftFile = (slot) => run("readwrite", (s) => s.delete(slot));

export async function loadDraftFiles() {
  try {
    const db = await open();
    const entries = await new Promise((resolve, reject) => {
      const out = [];
      const req = db.transaction("files").objectStore("files").openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(out);
        out.push([cursor.key, cursor.value]);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return entries;
  } catch {
    return [];
  }
}

export async function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  await run("readwrite", (s) => s.clear());
}
