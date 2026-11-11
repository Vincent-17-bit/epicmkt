export const SPEC_LEVELS = Object.freeze(["required", "recommended", "optional"]);
export const SPEC_INPUTS = Object.freeze(["text", "number", "choice", "openValue", "boolean", "dimension"]);
export const MAX_REQUIRED_ROWS = 4;

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => typeof v === "string" && v.trim() !== "";

export function checkSpecRows(rows, path = "specRows") {
  if (!Array.isArray(rows)) return [`${path}: must be a list`];
  const out = [];
  const keys = [];
  rows.forEach((r, i) => {
    const at = `${path}.${i}`;
    if (!isRecord(r)) { out.push(`${at}: must be an object`); return; }
    if (!(typeof r.key === "string" && SLUG.test(r.key))) out.push(`${at}.key: must be a slug`);
    if (!text(r.label)) out.push(`${at}.label: required`);
    if (!SPEC_LEVELS.includes(r.level)) out.push(`${at}.level: must be one of ${SPEC_LEVELS.join(", ")}`);
    if (!SPEC_INPUTS.includes(r.input)) out.push(`${at}.input: must be one of ${SPEC_INPUTS.join(", ")}`);
    if (r.choices !== undefined && !(Array.isArray(r.choices) && r.choices.length > 0 && r.choices.every(text))) out.push(`${at}.choices: must be a list of text`);
    if (r.input === "choice" && r.choices === undefined) out.push(`${at}.choices: required for a choice row`);
    keys.push(r.key);
  });
  if (keys.some((k, i) => keys.indexOf(k) !== i)) out.push(`${path}: keys must be unique`);
  const required = rows.filter((r) => r?.level === "required").length;
  if (required > MAX_REQUIRED_ROWS) out.push(`${path}: at most ${MAX_REQUIRED_ROWS} required rows (found ${required})`);
  return out;
}

export const isSpecRows = (rows) => checkSpecRows(rows).length === 0;
