import { z } from "npm:zod@3";

export const MAX_FILES = 14;
export const SLOT_LIMITS = { image: 10 * 1024 * 1024, pdf: 8 * 1024 * 1024 };
export const ALLOWED_EXT: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};
export const MIME_BY_KIND: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp",
};

export const clean = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const noLinks = (s: string) => !/(https?:\/\/|www\.)/i.test(s);
const noEmoji = (s: string) => !/\p{Extended_Pictographic}/u.test(s);
export const nairobiToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export function normalizePhone(raw: string): string | null {
  const m = raw.replace(/[\s\-().]/g, "").match(/^(?:\+?254|0)([71]\d{8})$/);
  return m ? `+254${m[1]}` : null;
}

const text = (min: number, max: number) => z.string().transform(clean).pipe(z.string().min(min).max(max));

const phone = z.string().max(24).transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid Kenyan phone number" });
    return z.NEVER;
  }
  return n;
});
const optionalPhone = z.union([z.literal(""), z.undefined(), phone]).transform((v) => (v === "" ? undefined : v));
const optionalUrl = z
  .union([z.literal(""), z.undefined(), z.string().url().max(200).refine((u) => /^https?:\/\//i.test(u), "Use http or https")])
  .transform((v) => (v === "" ? undefined : v));

export const applicationSchema = z
  .object({
    categoryId: z.string().regex(/^[a-z0-9-]{2,50}$/),
    planKey: z.enum(["standard", "premium"]),
    owner: z.object({
      fullName: text(3, 80).refine(noLinks, "No links").refine(noEmoji, "No emoji"),
      idType: z.enum(["national_id", "passport"]),
      idNumber: z.string().transform((v) => v.replace(/\s/g, "").toUpperCase()),
    }),
    phone,
    altPhone: optionalPhone,
    email: z.string().trim().toLowerCase().email().max(120),
    business: z.object({
      name: text(3, 60).refine(noLinks, "No links").refine(noEmoji, "No emoji"),
      registered: z.boolean(),
      regType: z.enum(["sole_proprietor", "partnership", "limited_company"]).optional(),
      regNumber: text(0, 40).optional(),
      yearEstablished: z.coerce.number().int().min(1900).max(new Date().getFullYear()),
      kraPin: z.string().trim().toUpperCase().optional(),
      sbpNumber: text(3, 40),
      sbpExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      shortDescription: text(0, 160).refine(noLinks, "No links").optional(),
    }),
    location: z.object({
      county: text(2, 40),
      town: text(2, 60),
      address: text(3, 160),
      lat: z.number().min(-5).max(5.5),
      lng: z.number().min(33.5).max(42),
    }),
    contacts: z.object({
      businessPhones: z.array(phone).min(1).max(3),
      whatsapp: phone,
      website: optionalUrl,
      socials: z.record(z.string().max(200)).default({}),
    }),
    templateValues: z.record(z.unknown()).default({}).refine((v) => JSON.stringify(v).length <= 8000, "Too large"),
    conditionalDocs: z.record(z.boolean()).default({}),
    termsVersion: z.string().max(40),
    privacyVersion: z.string().max(40),
    agreeTerms: z.literal(true),
    agreePrivacy: z.literal(true),
    authorised: z.literal(true),
  })
  .superRefine((p, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    if (p.owner.idType === "national_id" && !/^\d{7,8}$/.test(p.owner.idNumber))
      fail(["owner", "idNumber"], "National ID must be 7 or 8 digits");
    if (p.owner.idType === "passport" && !/^[A-Z0-9]{6,9}$/.test(p.owner.idNumber))
      fail(["owner", "idNumber"], "Passport number must be 6 to 9 letters or digits");
    if (p.business.sbpExpiry < nairobiToday())
      fail(["business", "sbpExpiry"], "Your Single Business Permit has expired");
    const pinOk = (v?: string) => !!v && /^[AP]\d{9}[A-Z]$/.test(v);
    if (p.business.registered) {
      if (!p.business.regType) fail(["business", "regType"], "Choose the registration type");
      if (!p.business.regNumber) fail(["business", "regNumber"], "Enter the registration number");
      if (!pinOk(p.business.kraPin)) fail(["business", "kraPin"], "Enter a valid KRA PIN, for example A123456789Z");
    } else if (p.business.kraPin && !pinOk(p.business.kraPin)) {
      fail(["business", "kraPin"], "Enter a valid KRA PIN, for example A123456789Z");
    }
  });

type Cat = { extra_docs: { key: string; rule: "required" | "conditional" | "optional" }[] };

export function requiredSlots(
  cat: Cat,
  p: { ownerIdType: string; registered: boolean; conditionalDocs?: Record<string, boolean> },
): string[] {
  const slots = ["owner_id_front", "sbp", "signboard"];
  if (p.ownerIdType === "national_id") slots.push("owner_id_back");
  if (p.registered) slots.push("br_cert", "kra_pin_cert");
  for (const d of cat.extra_docs) {
    if (d.rule === "required") slots.push(`cat_${d.key}`);
    else if (d.rule === "conditional" && p.conditionalDocs?.[d.key]) slots.push(`cat_${d.key}`);
  }
  return slots;
}

export function allowedSlots(cat: Cat): string[] {
  return ["owner_id_front", "owner_id_back", "sbp", "signboard", "br_cert", "kra_pin_cert",
    ...cat.extra_docs.map((d) => `cat_${d.key}`)];
}
