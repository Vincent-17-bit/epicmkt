import { adminFn, audit, json, z, type AdminDeps } from "../_shared/adminKit.ts";

const Body = z.object({
  businessId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Lets an owner open the seller site as one business. It signs nobody in by itself and never reveals or changes the seller's password:
 * it asks Supabase for a one-time sign-in token for that seller's own login (`magiclink`, delivered nowhere), and returns the token's hash.
 * The seller site exchanges it for a normal seller session for that one business, so RLS shows exactly that business and nothing else.
 * The token works once. Every call is audited with the admin who made it.
 */
export const adminOpenSeller = (d: AdminDeps) =>
  adminFn(d, { name: "open-seller", roles: ["owner"], max: 20, seconds: 3600, schema: Body }, async (c) => {
    const { businessId, reason } = c.input;
    const { data: biz } = await d.db.from("businesses")
      .select("id,seller_id,user_id,name,status")
      .eq("id", businessId).maybeSingle();
    if (!biz || biz.status === "deleted") return json({ error: "not_found" }, 404);
    if (!biz.user_id) return json({ error: "no_login" }, 409);

    const user = await d.db.auth.admin.getUserById(biz.user_id);
    const email = user.data?.user?.email;
    if (user.error || !email) return json({ error: "no_login" }, 409);

    const link = await d.db.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) throw new Error("auth_link_failed");

    await audit(c, {
      action: "business.admin_open_seller", targetType: "business", targetId: businessId, businessId,
      after: { sellerId: biz.seller_id }, reason: reason || null,
    });

    return json({ ok: true, businessId, businessName: biz.name, sellerId: biz.seller_id, tokenHash });
  });
