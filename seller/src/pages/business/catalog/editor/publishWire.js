export function blockedText(err) {
  if (err?.code !== "publish_blocked") return null;
  let list = [];
  try { list = JSON.parse(err.details ?? "[]"); } catch { list = []; }
  const lines = (Array.isArray(list) ? list : []).map((i) => i?.message ?? i?.label).filter(Boolean);
  return lines.length ? `Not published. ${lines.join(". ")}.` : "Not published. Some required details are missing.";
}
