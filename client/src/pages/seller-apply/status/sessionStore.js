const KEY = "epicmkt.status.session";

const parse = (store) => {
  try {
    return JSON.parse(store.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};

export function readSession() {
  const kept = parse(localStorage);
  if (kept?.token) return kept;
  const s = parse(sessionStorage);
  return s && new Date(s.expiresAt).getTime() > Date.now() ? s : null;
}

export function saveSession(s) {
  try {
    (s.remembered ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {}
}
