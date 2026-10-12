import { z } from "zod";
import {
  AVAILABILITY_DEFAULTS,
  CARD_VIEWS,
  CLOSURE_LABEL_MAX,
  CLOSURE_MESSAGE_MAX,
  CLOSURE_REASON_LIMIT,
  DENSITIES,
  EVENT_KEYS,
  GREETING_MAX,
  GREETING_MESSAGES,
  IDLE_OPTIONS,
  PARTIAL_MESSAGE_MAX,
  PRICE_REMINDER_DAYS,
  TEXT_SIZES,
  THEMES,
  THRESHOLD_MAX,
  UNITS_PER_CATEGORY,
  UNIT_MAX,
  greetingProblems,
  isClock,
  isCriticalEvent,
  plainTextProblem
} from "@epicmkt/shared";

const oneOf = (list) => z.custom((v) => list.includes(v), { message: "Choose one of the listed options." });
const clock = z.string().refine(isClock, "Use the 24-hour format, for example 21:00.");

export const PLAIN_MESSAGES = {
  empty: "This cannot be empty.",
  too_long: "This is too long.",
  has_link: "Links are not allowed here.",
  has_phone: "Phone numbers are not allowed here."
};

const plainText = (max) => z.string().superRefine((value, ctx) => {
  const problem = plainTextProblem(value, max);
  if (problem) ctx.addIssue({ code: "custom", message: PLAIN_MESSAGES[problem] });
});

export const greetingSchema = z.string().superRefine((value, ctx) => {
  for (const problem of greetingProblems(value)) ctx.addIssue({ code: "custom", message: GREETING_MESSAGES[problem] });
});

export const closureReasonSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  label: plainText(CLOSURE_LABEL_MAX),
  message: z.string().max(CLOSURE_MESSAGE_MAX, "Keep it under 140 characters.").superRefine((v, ctx) => {
    if (v.trim() && plainTextProblem(v, CLOSURE_MESSAGE_MAX)) ctx.addIssue({ code: "custom", message: PLAIN_MESSAGES[plainTextProblem(v, CLOSURE_MESSAGE_MAX)] });
  })
});

export const closureReasonsSchema = z.array(closureReasonSchema).min(1, "Keep at least one reason.").max(CLOSURE_REASON_LIMIT, `Up to ${CLOSURE_REASON_LIMIT} reasons.`).superRefine((list, ctx) => {
  const seen = new Set();
  list.forEach((r, i) => {
    const key = r.label.trim().toLowerCase();
    if (seen.has(key)) ctx.addIssue({ code: "custom", path: [i, "label"], message: "Each reason needs a different name." });
    seen.add(key);
  });
});

export const unitsSchema = z.array(z.string().trim().min(1).max(UNIT_MAX, `Up to ${UNIT_MAX} characters.`)).max(UNITS_PER_CATEGORY, `Up to ${UNITS_PER_CATEGORY} units.`);
export const emailSchema = z.string().trim().max(120).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter a valid email address.");
export const phoneSchema = z.string().transform((v) => v.replace(/[\s().-]/g, "")).pipe(z.string().regex(/^(?:\+?254|0)[71][0-9]{8}$/, "Enter a Kenyan number such as 0712 345 678."));

const channels = z.object({ in_app: z.boolean(), sms: z.boolean(), email: z.boolean() }).partial();

export const patchSchema = z.object({
  idle_minutes: oneOf(IDLE_OPTIONS),
  appearance: z.object({
    theme: oneOf(THEMES),
    text_size: oneOf(TEXT_SIZES),
    density: oneOf(DENSITIES),
    reduce_motion: z.boolean(),
    remember_card_view: z.boolean(),
    card_view: oneOf(CARD_VIEWS)
  }).partial().strict(),
  notifications: z.object({
    events: z.object(Object.fromEntries(EVENT_KEYS.map((k) => [k, channels.strict().superRefine((v, ctx) => {
      if (isCriticalEvent(k) && v.in_app === false) ctx.addIssue({ code: "custom", message: "In-app notifications are required for this event." });
    }).optional()]))).strict().partial(),
    quiet_hours: z.object({ enabled: z.boolean(), start: clock, end: clock }).partial().strict().refine((q) => !(q.start && q.end) || q.start !== q.end, "Start and end must be different.")
  }).partial().strict(),
  catalog: z.object({
    default_availability: oneOf(AVAILABILITY_DEFAULTS),
    low_stock_threshold: z.number().int("Use a whole number.").min(0, "Use 0 or more.").max(THRESHOLD_MAX, `Use ${THRESHOLD_MAX} or less.`),
    price_reminder_days: oneOf(PRICE_REMINDER_DAYS),
    start_visible: z.boolean(),
    default_units: z.record(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), unitsSchema),
    show_only_n_left: z.boolean()
  }).partial().strict(),
  messaging: z.object({ whatsapp_greeting: greetingSchema, closure_reasons: closureReasonsSchema }).partial().strict(),
  business: z.object({
    show_closes_chip: z.boolean(),
    partial_closure_message: plainText(PARTIAL_MESSAGE_MAX),
    announcement: z.object({ enabled: z.boolean(), text: z.string().max(280, "Keep it under 280 characters."), days: z.number().int().min(1).max(90) }).partial().strict()
  }).partial().strict(),
  onboarding: z.object({ status: oneOf(["active", "skipped", "done"]), dismissed_tips: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)).max(40), completed_at: z.string().nullable(), qr_seen: z.boolean() }).partial().strict()
}).partial().strict();

// Returns { ok: true } or { ok: false, message, path } for the first problem.
export function validatePatch(patch) {
  const result = patchSchema.safeParse(patch);
  if (result.success) return { ok: true };
  const issue = result.error.issues[0];
  return { ok: false, message: issue.message === "Required" || issue.code === "unrecognized_keys" ? "That setting is not available." : issue.message, path: issue.path.join(".") };
}

export const validateField = (schema, value) => {
  const r = schema.safeParse(value);
  return r.success ? null : r.error.issues[0].message;
};

export { GREETING_MAX };
