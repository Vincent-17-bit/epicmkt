const HOUR = 3600000;
const latency = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const at = (offset) => new Date(Date.now() + offset).toISOString();

let rows = [
  { id: "fs-1", businessName: "Fade Kings", itemName: "Fade and beard", discount: "20% off", startsAt: at(-2 * HOUR), endsAt: at(4 * HOUR), status: "live", endedReason: null },
  { id: "fs-2", businessName: "Mara Fresh Mart", itemName: "Dairy meal 70kg", discount: "KES 200 off", startsAt: at(-3 * HOUR), endsAt: at(12 * HOUR), status: "live", endedReason: null },
  { id: "fs-3", businessName: "Umoja Hardware", itemName: "Two burner cooker", discount: "Sale price KES 3,500", startsAt: at(5 * HOUR), endsAt: at(30 * HOUR), status: "scheduled", endedReason: null },
  { id: "fs-4", businessName: "Green Valley Foods", itemName: "1 kg vanilla cake", discount: "15% off", startsAt: at(-30 * HOUR), endsAt: at(-6 * HOUR), status: "ended", endedReason: "time" },
];

const settle = () => {
  const now = Date.now();
  rows = rows.map((row) => {
    if (row.status === "scheduled" && Date.parse(row.startsAt) <= now) return { ...row, status: "live" };
    if (row.status === "live" && Date.parse(row.endsAt) <= now) return { ...row, status: "ended", endedReason: "time" };
    return row;
  });
};

export async function listFlashSales({ status = "" } = {}) {
  await latency();
  settle();
  return rows.filter((row) => !status || row.status === status).map((row) => ({ ...row }));
}

export async function endFlashSale({ id, reason }) {
  await latency();
  settle();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("This flash sale no longer exists.");
  if (!["live", "scheduled"].includes(row.status)) throw new Error("This flash sale has already ended.");
  if (String(reason ?? "").trim().length < 3) throw new Error("Give a reason.");
  rows = rows.map((r) => (r.id === id ? { ...r, status: r.status === "scheduled" ? "cancelled" : "ended", endedReason: "admin", adminReason: reason.trim() } : r));
  return { ok: true };
}
