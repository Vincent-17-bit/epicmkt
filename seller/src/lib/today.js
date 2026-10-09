const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function todaySentences({ catalog, notifications = [], questions = [], left = null, state }) {
  const out = [];
  if (state === "grace") out.push("Your listing expires today.");
  else if (state === "live" && left !== null && left <= 7) out.push(`Your listing expires in ${plural(left, "day", "days")}.`);
  const unread = notifications.filter((n) => !n.read).length;
  if (questions.length) out.push(`${plural(questions.length, "question", "questions")} from the EpicMKT team ${questions.length === 1 ? "is" : "are"} waiting for your reply.`);
  if (catalog?.out_of_stock) out.push(`${plural(catalog.out_of_stock, "item is", "items are")} out of stock.`);
  if (catalog?.stale_prices) out.push(`${plural(catalog.stale_prices, "price has", "prices have")} not been confirmed in 90 days.`);
  if (unread) out.push(`You have ${plural(unread, "unread notification", "unread notifications")}.`);
  return out;
}
