const EAT_MS = 3 * 3600 * 1000;

export const toEatInput = (iso) => (iso ? new Date(Date.parse(iso) + EAT_MS).toISOString().slice(0, 16) : "");

export const fromEatInput = (value) => (value ? new Date(`${value}:00+03:00`).toISOString() : "");

const fmt = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export const formatEat = (iso) => (iso ? fmt.format(new Date(iso)) : "");

export const nowEatInput = (offsetMinutes = 0) => toEatInput(new Date(Date.now() + offsetMinutes * 60000).toISOString());

export const formatKes = (n) => (n === null || n === undefined ? "No price" : `KES ${Number(n).toLocaleString("en-KE")}`);
