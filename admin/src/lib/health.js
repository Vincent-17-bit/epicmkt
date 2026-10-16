const clamp = (value) => Math.max(0, Math.min(100, value));

export function healthScore({ completeness, priceAgeDays, loginAgeDays, openReports }) {
  const price = clamp(100 - priceAgeDays * 2.5);
  const login = clamp(100 - loginAgeDays * 4);
  const reports = clamp(100 - openReports * 35);
  return Math.round(completeness * 0.35 + price * 0.25 + login * 0.25 + reports * 0.15);
}
