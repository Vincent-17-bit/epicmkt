import { z } from "zod";

// Empty input must fail, not become 0.
const whole = (label, { min = 0, max = 1_000_000 } = {}) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? NaN : Number(v)),
    z
      .number({ invalid_type_error: "Enter a number" })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be ${max.toLocaleString("en-KE")} or less`),
  );

export const BADGES = ["Best value", "Popular"];

export const planSchema = z.object({
  price: whole("Price", { max: 100000 }),
  items: whole("Item limit"),
  topBenefits: z.array(z.string().trim().min(1, "Required").max(80, "80 characters or fewer")).length(3, "Exactly 3 benefits"),
  badge: z.enum(BADGES).nullable(),
  trialDays: whole("Trial days", { max: 90 }),
});

export const planPairSchema = z
  .object({ standard: planSchema, premium: planSchema })
  .superRefine((v, ctx) => {
    if (v.premium.price < v.standard.price)
      ctx.addIssue({ code: "custom", path: ["premium", "price"], message: "Premium cannot cost less than Standard" });
    if (v.premium.items < v.standard.items)
      ctx.addIssue({ code: "custom", path: ["premium", "items"], message: "Premium cannot allow fewer items than Standard" });
  });

export const LIMIT_FIELDS = [
  { key: "photosPerItem", label: "Photos per item" },
  { key: "videosPerItem", label: "Videos per item" },
  { key: "galleryPhotos", label: "Gallery photos" },
  { key: "faqs", label: "FAQs" },
  { key: "activeOffers", label: "Active offers", unlimitedAllowed: true },
  { key: "flashSalesPerMonth", label: "Flash sales a month" },
  { key: "flashSalesConcurrent", label: "Flash sales at once" },
];

const limitsFor = z.object(
  Object.fromEntries(
    LIMIT_FIELDS.map((f) => [
      f.key,
      f.unlimitedAllowed ? z.union([z.null(), whole(f.label, { min: 1, max: 10000 })]) : whole(f.label, { min: 1, max: 10000 }),
    ]),
  ),
);

export const limitsSchema = z.object({ standard: limitsFor, premium: limitsFor }).superRefine((v, ctx) => {
  for (const f of LIMIT_FIELDS) {
    const s = v.standard[f.key] ?? Infinity;
    const p = v.premium[f.key] ?? Infinity;
    if (p < s) ctx.addIssue({ code: "custom", path: ["premium", f.key], message: `Premium cannot be lower than Standard` });
  }
});

export const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,24}$/, "3 to 24 characters: A to Z, 0 to 9 and hyphen"),
    kind: z.enum(["percent", "fixed"]),
    value: whole("Value", { min: 1, max: 100000 }),
    scopeCategory: z.string().nullable(),
    scopePlan: z.enum(["standard", "premium"]).nullable(),
    validFrom: z.string().nullable(),
    validUntil: z.string().nullable(),
    maxRedemptions: z.union([z.null(), whole("Redemption cap", { min: 1, max: 1_000_000 })]),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "percent" && v.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage cannot exceed 100" });
    if (v.validFrom && v.validUntil && v.validUntil < v.validFrom)
      ctx.addIssue({ code: "custom", path: ["validUntil"], message: "End date is before the start date" });
  });

// Returns { ok, data, errors } where errors is keyed by dotted path, e.g. "premium.topBenefits.1".
export function validate(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data, errors: {} };
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, data: null, errors };
}
