const KEY = "epicmkt-recent-searches";
const MAX = 8;

export const normalizeTerm = (value) => {
  const clean = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return clean.length >= 2 ? clean : "";
};

export function getRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list.filter((item) => typeof item === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

const save = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  return list;
};

export function addRecent(term) {
  const clean = normalizeTerm(term);
  if (!clean) return getRecent();
  return save([clean, ...getRecent().filter((item) => item !== clean)].slice(0, MAX));
}

export const removeRecent = (term) => save(getRecent().filter((item) => item !== term));

export const clearRecent = () => save([]);
