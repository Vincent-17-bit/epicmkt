const CHANNELS = ["sms", "email"];
const NAMES = { sms: "SMS", email: "email" };

/** The newest login-send result per channel, from message rows (newest first). */
export function summarizeLoginDelivery(rows = []) {
  const latest = {};
  for (const row of rows) if (CHANNELS.includes(row.channel) && !latest[row.channel]) latest[row.channel] = row;
  const state = (channel) => (latest[channel] ? (latest[channel].status === "failed" ? "failed" : "ok") : "unknown");
  const sms = state("sms");
  const email = state("email");
  const known = CHANNELS.filter((c) => latest[c]);
  return {
    sms,
    email,
    failed: sms === "failed" || email === "failed",
    sentAt: known.map((c) => latest[c].created_at).sort().at(-1) ?? null,
    label: known.length ? `Login sent: ${known.map((c) => `${NAMES[c]} ${state(c) === "ok" ? "ok" : "failed"}`).join(" / ")}` : "Login not sent yet",
  };
}
