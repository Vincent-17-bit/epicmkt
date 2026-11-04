export const timeLeft = (endsAt, now) => {
  if (!endsAt) return "No end date";
  const ms = Date.parse(endsAt) - now;
  if (!(ms > 0)) return "Ended";
  const mins = Math.max(1, Math.ceil(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `Ends in ${d}d ${h}h`;
  if (h > 0) return `Ends in ${h}h ${m}m`;
  return `Ends in ${m}m`;
};
