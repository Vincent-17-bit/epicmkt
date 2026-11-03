export const deltaText = (now, before) => {
  if (now === before) return "same as before";
  if (before === 0) return "new";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
};

export const barHeights = (rows, key) => {
  const top = Math.max(0, ...rows.map((r) => r[key]));
  return rows.map((r) => (top === 0 ? 0 : Math.max(4, Math.round((r[key] / top) * 100))));
};
