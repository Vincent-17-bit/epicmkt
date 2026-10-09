export const readStore = (key, fallback = null) => {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
};

export const writeStore = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
};
