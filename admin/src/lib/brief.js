// Today's Brief: one plain sentence and up to three buttons, made by rules from admin_counts().
// Nothing here is written by a model. The same counts always give the same words.
const n = (v) => Math.max(0, Number(v) || 0);
const plural = (count, one, many) => (count === 1 ? one : many);

// Order = how the sentence is built. `can` says whether this role may open the page behind it.
const TOPICS = [
  {
    id: "applications", permission: "applications.view", route: "/admin/applications?status=submitted",
    count: (c) => n(c.submitted),
    phrase: (k, ctx) => `${k} ${plural(k, "application is", "applications are")} waiting${ctx.waitingOver24h > 0 ? ` (${ctx.waitingOver24h} for over 24 hours)` : ""}`,
    button: () => "Review queue",
  },
  {
    id: "payments", permission: "payments.view", route: "/admin/payments?status=submitted",
    count: (c) => n(c.unconfirmed_payments),
    phrase: (k) => `${k} ${plural(k, "payment needs", "payments need")} confirming`,
    button: (can) => (can("payments.confirm") ? "Confirm payments" : "View payments"),
  },
  {
    id: "expiring", permission: "businesses.view", route: "/admin/businesses?filter=expiring",
    count: (c) => n(c.expiring_7d),
    phrase: (k) => `${k} ${plural(k, "seller expires", "sellers expire")} within 7 days`,
    button: () => "See expiring sellers",
  },
  {
    id: "failed", permission: "messages.view", route: "/admin/messages?status=failed",
    count: (c) => n(c.failed_messages),
    phrase: (k) => `${k} ${plural(k, "message", "messages")} failed to send`,
    button: () => "Fix failed messages",
  },
  {
    id: "moderation", permission: "moderation.view", route: "/admin/moderation",
    count: (c) => n(c.open_flags) + n(c.open_reports),
    phrase: (k) => `${k} ${plural(k, "flag or report is", "flags and reports are")} open`,
    button: () => "Open flags",
  },
  {
    id: "changes", permission: "changes.view", route: "/admin/changes",
    count: (c) => n(c.pending_changes),
    phrase: (k) => `${k} ${plural(k, "change request is", "change requests are")} pending`,
    button: () => "Change requests",
  },
];

const FALLBACKS = [
  { id: "message", permission: "messages.send", route: "/admin/messages", label: "Message sellers" },
  { id: "businesses", permission: "businesses.view", route: "/admin/businesses", label: "Browse businesses" },
];

const join = (parts) => (parts.length <= 1 ? parts[0] ?? "" : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);
const sentence = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * @returns {{ text: string, tone: "calm"|"busy"|"urgent", total: number, actions: {id, label, to, primary}[] }}
 * `can(action)` hides topics this role cannot open. Calm = nothing waiting. Urgent = something waited over a day,
 * or messages failed to send.
 */
export function buildBrief(counts, { waitingOver24h = 0, can = () => true } = {}) {
  const c = counts ?? {};
  const ctx = { waitingOver24h: n(waitingOver24h) };
  const topics = TOPICS.filter((t) => can(t.permission)).map((t) => ({ ...t, k: t.count(c) })).filter((t) => t.k > 0);

  if (topics.length === 0) {
    const actions = FALLBACKS.filter((f) => can(f.permission)).slice(0, 3).map((f, i) => ({ id: f.id, label: f.label, to: f.route, primary: i === 0 }));
    return { text: "You are all caught up. Nothing is waiting for you right now.", tone: "calm", total: 0, actions };
  }

  const shown = topics.slice(0, 3);
  const rest = topics.length - shown.length;
  let text = sentence(join(shown.map((t) => t.phrase(t.k, ctx))));
  text += rest > 0 ? `. ${rest} more ${plural(rest, "area needs", "areas need")} a look.` : ".";

  const actions = shown.map((t, i) => ({ id: t.id, label: t.button(can), to: t.route, primary: i === 0 }));
  for (const f of FALLBACKS) {
    if (actions.length >= 3) break;
    if (can(f.permission) && !actions.some((a) => a.id === f.id)) actions.push({ id: f.id, label: f.label, to: f.route, primary: false });
  }

  const urgent = ctx.waitingOver24h > 0 || n(c.failed_messages) > 0;
  return { text, tone: urgent ? "urgent" : "busy", total: topics.reduce((s, t) => s + t.k, 0), actions };
}
