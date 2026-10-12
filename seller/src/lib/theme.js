export const THEME_KEY = "epicmkt-theme";
export const MODES = ["light", "dark", "system"];

export const readMode = () => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return MODES.includes(v) ? v : "system";
  } catch {
    return "system";
  }
};

export const resolveMode = (mode) =>
  mode === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;

export const applyMode = (mode) => {
  document.documentElement.dataset.theme = resolveMode(mode);
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    return;
  }
};

export const nextMode = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length];
