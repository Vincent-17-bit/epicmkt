// Zod building blocks and the request parser shared by the admin functions.
import { z } from "npm:zod@3";
import { HttpError } from "./errors.ts";
import { isDay } from "./dates.ts";
import { normalizePhone } from "./validate.ts";
import { ADMIN_ROLES } from "./roles.ts";

export { z };
export { ADMIN_ROLES, type AdminRole } from "./roles.ts";

export const uuid = z.string().uuid();
export const adminRole = z.enum(ADMIN_ROLES);

/** Plain text, trimmed, 3 to 500 characters (why a decision was taken). */
export const reason = z.string().trim().min(3).max(500);
export const optionalReason = z.string().trim().max(500).optional();

/** M-Pesa confirmation code: 10 letters and digits, same rule as the payments.mpesa_code check. */
export const mpesaCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/, "M-Pesa codes are 10 letters and digits");

/** Whole shillings, 1 to 1,000,000. */
export const kes = z.number().int().min(1).max(1_000_000);

/** Any phone number, stored as E.164. Kenyan local forms are converted to +254. */
export const kenyanPhone = z.string().max(24).transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid phone number, with country code for numbers outside Kenya" });
    return z.NEVER;
  }
  return n;
});

export const isoDay = z.string().refine(isDay, "Use a real date as YYYY-MM-DD");

export const pagination = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});
export const pageRange = (p: { page: number; pageSize: number }) => ({ from: (p.page - 1) * p.pageSize, to: p.page * p.pageSize - 1 });

export const channels = z
  .object({ sms: z.boolean().default(false), email: z.boolean().default(false), inApp: z.boolean().default(false) })
  .default({ sms: false, email: false, inApp: false });

export const BUSINESS_STATUSES = ["pending", "live", "paused", "suspended", "expired", "deleted"] as const;
export const APPLICATION_STATUSES = [
  "uploading", "submitted", "under_review", "changes_requested", "approved", "payment_confirming", "activated", "rejected",
] as const;
export const PAYMENT_STATUSES = ["submitted", "confirmed", "rejected"] as const;
export const MESSAGE_STATUSES = ["queued", "sent", "delivered", "failed"] as const;

/** What the caller may learn about a bad request: where and why, never the value they sent. */
export const publicIssues = (error: z.ZodError) =>
  error.issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message }));

/** Parse an already-read value. Throws HttpError(422, "invalid_input"). */
export function parseValue<T>(value: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(422, "invalid_input", { issues: publicIssues(r.error) });
  return r.data;
}

/**
 * Read the JSON body and validate it. Bad JSON is a 400, a body that fails the schema is a 422.
 * Pass { allowEmpty: true } for endpoints whose fields all have defaults: an empty body then means {}.
 */
export async function parseBody<T>(req: Request, schema: z.ZodType<T, z.ZodTypeDef, unknown>, opts: { allowEmpty?: boolean } = {}): Promise<T> {
  let body: unknown;
  try {
    const text = await req.text();
    body = text.trim() === "" && opts.allowEmpty ? {} : JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_request");
  }
  return parseValue(body, schema);
}
