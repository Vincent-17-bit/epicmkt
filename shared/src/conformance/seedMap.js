// Which categories may sell which product type, read from the product_types seed in the migrations (the database is the source).
// Later rows win, so a re-seed or an update in a newer migration replaces the older answer.

const ROW = /\(\s*'([a-z0-9-]+)'\s*,\s*'[a-z0-9-]+'\s*,\s*'[^']*'\s*,\s*'(?:good|service|package)'\s*,\s*'[a-z0-9-]+'\s*,\s*'\{([^}]*)\}'/g;

/** @param {string} sql  the text of the migrations @returns {Record<string, string[]>} */
export function typeCategoriesFromSql(sql) {
  const out = {};
  for (const m of sql.matchAll(ROW)) out[m[1]] = m[2].split(",").map((s) => s.trim()).filter(Boolean);
  return out;
}
