const prefix = "epicmkt-admin-table:";

export function readStore(key) {
  if (!key) return {};
  try {
    return JSON.parse(localStorage.getItem(prefix + key)) ?? {};
  } catch {
    return {};
  }
}

export function writeStore(key, value) {
  if (!key) return;
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    return;
  }
}
