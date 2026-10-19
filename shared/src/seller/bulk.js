export const MAX_PERCENT_UP = 300;
export const MAX_PERCENT_DOWN = -90;
export const ROUNDING_RULE = "Prices are rounded to the nearest whole KES (halves round up) and never go below KES 1.";
export const MAX_SAVED_VIEWS = 10;
export const VIEW_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._&'()-]{0,29}$/;
export const BULK_ACTIONS = ["hide", "show", "delete", "move_section", "set_availability", "price_percent", "confirm_prices"];

export const validatePercent = (value) => {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false, message: "Enter a percentage." };
  if (n === 0) return { ok: false, message: "Enter a percentage other than 0." };
  if (Math.abs(Math.round(n * 10) / 10 - n) > 1e-9) return { ok: false, message: "Use at most one decimal place." };
  if (n < MAX_PERCENT_DOWN) return { ok: false, message: `You can lower prices by at most ${Math.abs(MAX_PERCENT_DOWN)}%.` };
  if (n > MAX_PERCENT_UP) return { ok: false, message: `You can raise prices by at most ${MAX_PERCENT_UP}%.` };
  return { ok: true, tenths: Math.round(n * 10), value: Math.round(n * 10) / 10 };
};

export const scalePrice = (value, tenths) => {
  if (value === null || value === undefined) return null;
  const cents = Math.round(value * 100);
  const scaled = Math.floor((cents * (1000 + tenths) + 50000) / 100000);
  return Math.max(1, scaled);
};

const collideSale = (sale, price) => {
  if (sale === null || price === null) return sale;
  if (sale < price) return sale;
  return price > 1 ? price - 1 : null;
};

export const previewPriceChange = (items, percent) => {
  const check = validatePercent(percent);
  if (!check.ok) return { ok: false, message: check.message, rows: [], affected: 0, skipped: 0 };
  const rows = [];
  let skipped = 0;
  for (const item of items) {
    const priced = ["fixed", "from", "range"].includes(item.priceType) && typeof item.price === "number";
    if (!priced) {
      skipped += 1;
      continue;
    }
    const price = scalePrice(item.price, check.tenths);
    const priceMax = item.priceMax === null || item.priceMax === undefined ? null : scalePrice(item.priceMax, check.tenths);
    const salePrice = collideSale(item.salePrice === null || item.salePrice === undefined ? null : scalePrice(item.salePrice, check.tenths), price);
    rows.push({
      id: item.id,
      name: item.name,
      before: { price: item.price, priceMax: item.priceMax ?? null, salePrice: item.salePrice ?? null },
      after: { price, priceMax, salePrice },
    });
  }
  return { ok: true, percent: check.value, tenths: check.tenths, rows, affected: rows.length, skipped, rule: ROUNDING_RULE };
};

export const applyPricePreview = (items, preview) => {
  const byId = new Map(preview.rows.map((r) => [r.id, r.after]));
  return items.map((item) => (byId.has(item.id) ? { ...item, ...byId.get(item.id) } : item));
};

export const validateViewName = (name) => {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value) return { ok: false, message: "Give the view a name." };
  if (value.length > 30) return { ok: false, message: "Use 30 characters or fewer." };
  if (!VIEW_NAME_PATTERN.test(value)) return { ok: false, message: "Use letters, numbers, spaces and . _ & ' ( ) - only." };
  return { ok: true, value };
};

export const validateSavedViews = (views) => {
  if (!Array.isArray(views)) return { ok: false, message: "Saved views must be a list." };
  if (views.length > MAX_SAVED_VIEWS) return { ok: false, message: `You can save at most ${MAX_SAVED_VIEWS} views.` };
  const seen = new Set();
  for (const v of views) {
    const name = validateViewName(v?.name);
    if (!name.ok) return name;
    if (typeof v.id !== "string" || !/^[A-Za-z0-9_-]{1,36}$/.test(v.id)) return { ok: false, message: "Invalid view id." };
    if (typeof v.query !== "string" || v.query.length > 600 || /[\u0000-\u001f]/.test(v.query)) return { ok: false, message: "Invalid view filters." };
    const key = name.value.toLowerCase();
    if (seen.has(key)) return { ok: false, message: "View names must be different." };
    seen.add(key);
  }
  return { ok: true };
};

export const addSavedView = (views, name, query, id = Math.random().toString(36).slice(2, 10)) => {
  const check = validateViewName(name);
  if (!check.ok) return { ok: false, message: check.message };
  if (views.length >= MAX_SAVED_VIEWS) return { ok: false, message: `You can save at most ${MAX_SAVED_VIEWS} views. Delete one first.` };
  if (views.some((v) => v.name.toLowerCase() === check.value.toLowerCase())) return { ok: false, message: "You already have a view with that name." };
  return { ok: true, views: [...views, { id, name: check.value, query }] };
};

export const reorderIds = (ids, from, to) => {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
