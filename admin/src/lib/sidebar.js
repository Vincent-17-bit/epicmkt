// Remembering whether the sidebar is collapsed. Pure helpers so they can be tested without a browser.

export const SIDEBAR_KEY = "epicmkt-admin-sidebar";
export const WIDE_MIN_PX = 1024;

export function parsePref(raw) {
  return raw === "collapsed" || raw === "expanded" ? raw : null;
}

/** A saved choice wins. Otherwise start open on wide screens and collapsed on tablets. */
export function initialCollapsed(saved, viewportWidth) {
  const pref = parsePref(saved);
  if (pref) return pref === "collapsed";
  return viewportWidth < WIDE_MIN_PX;
}

export function readSaved(storage) {
  try {
    return storage?.getItem(SIDEBAR_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeSaved(storage, collapsed) {
  try {
    storage?.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Private mode or storage disabled: the choice just will not survive a reload.
  }
}
