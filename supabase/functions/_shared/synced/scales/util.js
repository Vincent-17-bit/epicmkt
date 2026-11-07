// Shared parsing helpers for scales. Pure functions, no browser or Node APIs (safe to sync to edge functions).

export const ok = (value) => ({ ok: true, value });
export const fail = (code, message, extra = {}) => ({ ok: false, error: { code, message, ...extra } });

const VULGAR = { "½": " 1/2", "¼": " 1/4", "¾": " 3/4", "⅓": " 1/3", "⅔": " 2/3" };

/** Lower-case, trim, collapse spaces, unify quote marks and fractions. */
export const norm = (raw) =>
  String(raw ?? "")
    .replace(/[½¼¾⅓⅔]/g, (c) => VULGAR[c]) // before NFKC, which would turn ½ into 1⁄2
    .normalize("NFKC")
    .replace(/\u2044/g, "/")
    .replace(/[″”“]/g, '"')
    .replace(/[′’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const round = (n, dp = 6) => Math.round(n * 10 ** dp) / 10 ** dp;
export const roundTo = round;

/** "12", "1.5", "1,024", "1,5", "15 1/2", "1/2" -> number, or null. */
export const parseNumber = (text) => {
  const s = String(text).trim();
  let m = s.match(/^(\d+)\s+(\d)\/(\d)$/);
  if (m) return Number(m[3]) === 0 ? null : Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(\d)\/(\d)$/);
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2]);
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ""));
  if (/^\d+,\d{1,2}$/.test(s)) return Number(s.replace(",", "."));
  if (/^(\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
  return null;
};

const NUM_AT_START = /^(\d+\s+\d\/\d|\d\/\d|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?|\.\d+)\s*/;
/** Split "20 litres" -> { num: 20, rest: "litres" }. Returns null when the text does not start with a number. */
export const splitNumber = (text) => {
  const m = String(text).match(NUM_AT_START);
  if (!m) return null;
  const num = parseNumber(m[1]);
  return num === null ? null : { num, rest: String(text).slice(m[0].length).trim() };
};

/** Trim trailing zeros: 15.50 -> "15.5". */
export const num2str = (n) => String(round(n, 6));

/** True when n is a multiple of step (floating point safe). */
export const isMultiple = (n, step) => Math.abs(n / step - Math.round(n / step)) < 1e-9;

/** Linear interpolation over sorted rows [{x, y}]; null when outside the table. */
export const interpolate = (rows, x) => {
  if (!rows.length || x < rows[0].x - 1e-9 || x > rows[rows.length - 1].x + 1e-9) return null;
  for (let i = 0; i < rows.length; i += 1) {
    if (Math.abs(rows[i].x - x) < 1e-9) return rows[i].y;
    if (rows[i].x > x) {
      const a = rows[i - 1];
      const b = rows[i];
      return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    }
  }
  return null;
};

/** Round to the nearest half. */
export const toHalf = (n) => Math.round(n * 2) / 2;
