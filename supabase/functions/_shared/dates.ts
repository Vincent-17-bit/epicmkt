const EAT_OFFSET_MS = 3 * 3600_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const eatToday = (now: Date = new Date()): string =>
  new Date(now.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);

const daysInMonth = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

export function addCalendarMonth(date: string, months = 1): string {
  if (!ISO_DATE.test(date)) throw new Error("invalid_date");
  const [y, m, d] = date.split("-").map(Number);
  const index = m - 1 + months;
  const year = y + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  const day = Math.min(d, daysInMonth(year, month));
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const laterDate = (a: string, b: string): string => (a >= b ? a : b);
