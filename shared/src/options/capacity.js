// Storage sizes read better in the unit people use: 1024 GB is "1 TB", 2048 GB is "2 TB". A label that is not a plain size, or is
// below 1 TB, is returned exactly as the seller wrote it.

const SIZE = /^\s*(\d+(?:\.\d+)?)\s*(gb|tb)\s*$/i;

export const formatCapacityLabel = (label) => {
  const m = SIZE.exec(String(label ?? ""));
  if (!m) return label;
  const gb = Number(m[1]) * (m[2].toLowerCase() === "tb" ? 1024 : 1);
  if (!Number.isFinite(gb) || gb < 1024) return label;
  const tb = gb / 1024;
  return `${Number.isInteger(tb) ? tb : Number(tb.toFixed(2))} TB`;
};

// The same for a number of gigabytes.
export const formatGigabytes = (gb) => {
  const n = Number(gb);
  if (!Number.isFinite(n) || n <= 0) return "";
  return formatCapacityLabel(`${n} GB`);
};
