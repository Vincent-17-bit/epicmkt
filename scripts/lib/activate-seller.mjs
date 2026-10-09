import { randomInt } from "node:crypto";
import { passwordProblems, slugify } from "@epicmkt/shared";

export const SELLER_EMAIL_DOMAIN = "sellers.epicmkt.app";
export const sellerEmail = (sellerId) => `${sellerId.toLowerCase()}@${SELLER_EMAIL_DOMAIN}`;
export const makeSellerId = () => `ES${randomInt(100000, 1000000)}`;

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGIT = "23456789";
const pick = (set) => set[randomInt(set.length)];

export function makePassword(context = {}) {
  for (;;) {
    const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
    const all = UPPER + LOWER + DIGIT;
    while (chars.length < 14) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const password = chars.join("");
    if (passwordProblems(password, context).length === 0) return password;
  }
}

const isDuplicate = (error) => error?.code === "23505" || /duplicate key/i.test(error?.message ?? "");

export async function activateSeller(db, input, { paidDays = 30, now = () => new Date() } = {}) {
  const planKey = input.planKey ?? "standard";
  for (let attempt = 0; attempt < 5; attempt++) {
    const sellerId = makeSellerId();
    const password = makePassword({ sellerId, phone: input.phone });
    const created = await db.auth.admin.createUser({ email: sellerEmail(sellerId), password, email_confirm: true });
    if (created.error) throw new Error(`auth user: ${created.error.message}`);
    const userId = created.data.user.id;
    const paidUntil = new Date(now().getTime() + paidDays * 86400000).toISOString();
    const row = {
      seller_id: sellerId,
      user_id: userId,
      application_id: input.applicationId ?? null,
      slug: `${slugify(input.name)}-${sellerId.slice(2).toLowerCase()}`,
      name: input.name,
      category_id: input.categoryId,
      plan_key: planKey,
      status: "live",
      must_change_password: true,
      paid_until: paidUntil,
      phone: input.phone,
      whatsapp: input.whatsapp ?? input.phone,
      email: input.email ?? null,
      county: input.county ?? null,
      town: input.town ?? null,
      address: input.address ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    };
    const inserted = await db.from("businesses").insert(row).select("id").single();
    if (inserted.error) {
      await db.auth.admin.deleteUser(userId);
      if (isDuplicate(inserted.error)) continue;
      throw new Error(`business: ${inserted.error.message}`);
    }
    const businessId = inserted.data.id;
    if (input.payment) {
      await db.from("payments").insert({ business_id: businessId, amount_kes: input.payment.amountKes, reference: input.payment.reference ?? null, method: input.payment.method ?? "mpesa" });
    }
    if (input.applicationId) {
      await db.from("applications").update({ status: "activated", seller_id: sellerId }).eq("id", input.applicationId);
    }
    return { sellerId, password, businessId, userId };
  }
  throw new Error("could not allocate a unique Seller ID");
}
