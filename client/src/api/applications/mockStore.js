const PRICING_KEY = 'epicmkt.mock.pricing';
const APPS_KEY = 'epicmkt.mock.applications';
const DB_NAME = 'epicmkt-mock';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const getPricingOverrides = () => read(PRICING_KEY, { plans: {}, limits: {} });

export function setPlanOverride(categoryId, planKey, patch) {
  const o = getPricingOverrides();
  const id = `${categoryId}:${planKey}`;
  o.plans[id] = { ...o.plans[id], ...patch, updatedAt: new Date().toISOString() };
  write(PRICING_KEY, o);
}

export function setLimitsOverride(planKey, patch) {
  const o = getPricingOverrides();
  o.limits[planKey] = { ...o.limits[planKey], ...patch };
  write(PRICING_KEY, o);
}

export const resetPricing = () => write(PRICING_KEY, { plans: {}, limits: {} });

export const listApplications = () => read(APPS_KEY, []);

export function saveApplication(record) {
  const rest = listApplications().filter((a) => a.referenceNo !== record.referenceNo);
  write(APPS_KEY, [...rest, record]);
}

const openDb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no_idb'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function saveFiles(referenceNo, files) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      files.forEach(({ slot, file }) => tx.objectStore('files').put(file, `${referenceNo}:${slot}`));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadFile(referenceNo, slot) {
  try {
    const db = await openDb();
    const file = await new Promise((resolve, reject) => {
      const req = db.transaction('files').objectStore('files').get(`${referenceNo}:${slot}`);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return file;
  } catch {
    return null;
  }
}

export const findApplication = (referenceNo) => listApplications().find((a) => a.referenceNo === referenceNo) ?? null;

export function updateApplication(referenceNo, change) {
  const rec = findApplication(referenceNo);
  if (!rec) return null;
  const next = typeof change === 'function' ? change(structuredClone(rec)) ?? rec : { ...rec, ...change };
  next.updatedAt = new Date().toISOString();
  saveApplication(next);
  return next;
}

export const readJson = read;
export const writeJson = write;
