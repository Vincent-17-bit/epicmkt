// "No category name hard-coded in source outside data and tests" (Prompt 11.4). The scan is pure: the caller passes the files in.

/** Paths that are data or sample data by nature. Anything else that names a category needs an entry below. */
export const DATA_PATH = /(^|\/)(data|fixtures|seeds?)\/|\.(test|spec)\.[jt]sx?$|(^|\/)mock[A-Za-z]*\.js$|\.seed\.js$|\.fixtures?\.js$|(^|\/)synced\//;

/**
 * Code that names a category today. Each entry says why it is allowed, and every one is a request to remove it, not a licence:
 * see docs/requests/2026-11-15-categories-hard-coded-in-source.md.
 */
export const ALLOWED_CATEGORY_NAME_FILES = Object.freeze({
  "shared/src/contracts/placement.js": "which shop categories show which departments first; moves to the departments data (request)",
  "shared/src/seller/limits.js": "per-category item limits; moves to plan data (request)",
  "shared/src/types/restrictions.js": "the two selling restrictions the law sets (chemist, agrovet); the DB rule is the source, this mirrors it",
  "backend/src/store.js": "the local mock API's demo shops"
});

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {{ path: string, text: string }[]} files  source files, paths relative to the repo root with forward slashes
 * @param {string[]} names  category ids (and names) to look for as quoted strings
 * @returns {{ path: string, names: string[] }[]}  files that name a category and are not allowed to
 */
export function scanForCategoryNames(files, names, allowed = ALLOWED_CATEGORY_NAME_FILES) {
  const quoted = names.map((n) => ({ n, re: new RegExp(`['"\`]${escape(n)}['"\`]`) }));
  const found = [];
  for (const f of files) {
    if (DATA_PATH.test(f.path) || Object.prototype.hasOwnProperty.call(allowed, f.path)) continue;
    const hit = quoted.filter(({ re }) => re.test(f.text)).map(({ n }) => n);
    if (hit.length) found.push({ path: f.path, names: hit });
  }
  return found;
}
