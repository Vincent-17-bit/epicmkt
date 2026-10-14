// Append-only audit writer for admin and system actions (public.audit_log, migration 0008).
// Every sensitive admin action calls writeAudit BEFORE it answers; if the write fails the action fails.
import { clientIp, sha256Hex } from "./http.ts";
import { HttpError } from "./errors.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export type AuditEntry = {
  /** The admin. Use actorRole "system" with no actor for cron jobs. */
  actor?: { id: string; email?: string | null } | null;
  actorRole?: "admin" | "system";
  /** "<area>.<verb>", for example "application.approve" or "payment.confirm". */
  action: string;
  targetType: string;
  targetId?: string | null;
  businessId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  /** Pass the request to store a salted hash of the caller's IP (never the IP itself). */
  req?: Request;
};

export const ACTION_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const SECRET_KEY_RE = /password|passwd|secret|token|api[_-]?key|authorization|cookie|otp|code_hash|service_role|jwt/i;
const MAX_JSON = 20_000;
const MAX_DEPTH = 6;
export const REASON_MAX = 500;

/** A copy that is safe to store: secret-looking keys are masked, depth and size are capped. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return null;
  return value;
}

function snapshot(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  const safe = redact(value);
  const size = JSON.stringify(safe).length;
  return size > MAX_JSON ? { truncated: true, size } : safe;
}

export async function writeAudit(db: Db, e: AuditEntry): Promise<void> {
  if (!ACTION_RE.test(e.action)) throw new RangeError(`bad audit action: ${e.action}`);
  const role = e.actorRole ?? "admin";
  if (role === "admin" && !e.actor?.id) throw new RangeError("an admin audit entry needs the actor");

  let ipHash: string | null = null;
  if (e.req) {
    const ip = clientIp(e.req);
    ipHash = await sha256Hex((Deno.env.get("IP_HASH_SALT") ?? "") + ip);
  }
  const reason = typeof e.reason === "string" && e.reason.trim() ? e.reason.trim().slice(0, REASON_MAX) : null;

  const { error } = await db.from("audit_log").insert({
    business_id: e.businessId ?? null,
    actor_id: e.actor?.id ?? null,
    actor_email: e.actor?.email ?? null,
    actor_role: role,
    action: e.action,
    target_type: e.targetType,
    target_id: e.targetId ?? null,
    before: snapshot(e.before),
    after: snapshot(e.after),
    reason,
    ip_hash: ipHash,
  });
  if (error) throw new HttpError(500, "audit_failed");
}
