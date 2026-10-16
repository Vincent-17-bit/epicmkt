import { addDays } from "../lib/time.js";
import { agents, businessStore } from "./mockBusinesses.js";

const actor = "Admin (AO)";
const MIN_REASON = 5;
const CHANNELS = ["sms", "email", "inApp"];

const audit = [];
const undoStore = new Map();
let sequence = 0;

const latency = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (code, message) => Object.assign(new Error(message), { code });

const handlers = {
  suspend: { applies: (row) => !row.deleted && row.status !== "suspended", patch: () => ({ status: "suspended" }) },
  unsuspend: { applies: (row) => !row.deleted && row.status === "suspended", patch: () => ({ status: "live" }) },
  unlist: { applies: (row) => !row.deleted && row.status !== "unlisted", patch: () => ({ status: "unlisted" }) },
  feature: {
    applies: (row, params) => !row.deleted && row.featured !== params.featured,
    patch: (row, params) => ({ featured: params.featured }),
  },
  extend: { applies: (row) => !row.deleted, patch: (row, params) => ({ paidUntil: addDays(row.paidUntil, params.days) }) },
  message: { applies: (row) => !row.deleted, patch: null },
  tag: {
    applies: (row, params) => !row.deleted && (params.mode === "remove" ? row.tags.includes(params.tag) : !row.tags.includes(params.tag)),
    patch: (row, params) => ({ tags: params.mode === "remove" ? row.tags.filter((tag) => tag !== params.tag) : [...row.tags, params.tag] }),
  },
  assign: {
    applies: (row, params) => !row.deleted && row.agent !== (params.agent ?? null),
    patch: (row, params) => ({ agent: params.agent ?? null }),
  },
  restore: { applies: (row) => row.deleted, patch: () => ({ deleted: false }) },
  export: { applies: () => true, patch: null },
};

function validate(action, params) {
  if (action === "feature" && typeof params.featured !== "boolean") throw fail("invalid_input", "Choose feature or remove feature");
  if (action === "extend" && !(Number.isInteger(params.days) && params.days >= 1 && params.days <= 365)) {
    throw fail("invalid_input", "Days must be a whole number from 1 to 365");
  }
  if (action === "message") {
    const body = (params.body ?? "").trim();
    if (!body || body.length > 480) throw fail("invalid_input", "Message must be 1 to 480 characters");
    if (!Array.isArray(params.channels) || !params.channels.length || params.channels.some((channel) => !CHANNELS.includes(channel))) {
      throw fail("invalid_input", "Choose at least one channel");
    }
  }
  if (action === "tag") {
    const tag = (params.tag ?? "").trim();
    if (!tag || tag.length > 30) throw fail("invalid_input", "Tag must be 1 to 30 characters");
    if (!["add", "remove"].includes(params.mode)) throw fail("invalid_input", "Choose add or remove");
  }
  if (action === "assign" && params.agent !== null && !agents.includes(params.agent)) throw fail("invalid_input", "Unknown agent");
}

export async function bulkBusinessAction({ action, ids, reason, params = {} }) {
  await latency();
  const handler = handlers[action];
  if (!handler) throw fail("unknown_action", "Unknown action");
  if (!Array.isArray(ids) || !ids.length) throw fail("invalid_input", "Select at least one business");
  if ((reason ?? "").trim().length < MIN_REASON) throw fail("reason_required", "A reason of at least 5 characters is required");
  const cleaned = action === "tag" ? { ...params, tag: params.tag?.trim() } : action === "message" ? { ...params, body: params.body?.trim() } : params;
  validate(action, cleaned);

  const wanted = new Set(ids);
  const targets = businessStore.filter((row) => wanted.has(row.id) && handler.applies(row, cleaned));
  const before = [];

  if (handler.patch) {
    for (const row of targets) {
      const patch = handler.patch(row, cleaned);
      before.push({ id: row.id, snapshot: Object.fromEntries(Object.keys(patch).map((key) => [key, row[key]])) });
      Object.assign(row, patch);
    }
  }

  sequence += 1;
  const entry = {
    id: `AUD-${String(sequence).padStart(5, "0")}`,
    at: new Date().toISOString(),
    actor,
    action,
    reason: reason.trim(),
    params: cleaned,
    requested: ids.length,
    affected: targets.length,
    skipped: ids.length - targets.length,
    ids: targets.map((row) => row.id),
    undone: false,
  };
  audit.unshift(entry);

  const undoToken = handler.patch && targets.length ? `undo-${entry.id}` : null;
  if (undoToken) undoStore.set(undoToken, { entryId: entry.id, before });
  return { affected: entry.affected, skipped: entry.skipped, undoToken, auditId: entry.id };
}

export async function undoBulkBusinessAction(undoToken) {
  await latency(160);
  const record = undoStore.get(undoToken);
  if (!record) throw fail("nothing_to_undo", "This action can no longer be undone");
  const byId = new Map(businessStore.map((row) => [row.id, row]));
  for (const { id, snapshot } of record.before) Object.assign(byId.get(id), snapshot);
  undoStore.delete(undoToken);

  const original = audit.find((entry) => entry.id === record.entryId);
  if (original) original.undone = true;
  sequence += 1;
  audit.unshift({
    id: `AUD-${String(sequence).padStart(5, "0")}`,
    at: new Date().toISOString(),
    actor,
    action: "undo",
    reason: `Undo of ${record.entryId}`,
    params: {},
    requested: record.before.length,
    affected: record.before.length,
    skipped: 0,
    ids: record.before.map((item) => item.id),
    undone: false,
  });
  return { restored: record.before.length };
}

export async function listAuditEntries({ limit = 50 } = {}) {
  await latency(80);
  return audit.slice(0, limit).map((entry) => ({ ...entry }));
}
