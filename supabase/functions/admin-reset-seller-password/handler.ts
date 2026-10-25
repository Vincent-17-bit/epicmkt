import { adminFn, audit, json, must, z, type AdminDeps } from "../_shared/adminKit.ts";
import { escapeHtml } from "../_shared/http.ts";

const Body = z.object({
  businessId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const adminResetSellerPassword = (d: AdminDeps) =>
  adminFn(d, { name: "reset-password", roles: ["owner"], max: 5, seconds: 3600, schema: Body }, async (c) => {
    const { businessId, reason } = c.input;
    const { data: biz } = await d.db.from("businesses")
      .select("id,seller_id,user_id,phone,email,status")
      .eq("id", businessId).maybeSingle();
    if (!biz || biz.status === "deleted") return json({ error: "not_found" }, 404);
    if (!biz.user_id) return json({ error: "no_login" }, 409);

    const password = d.password();
    const upd = await d.db.auth.admin.updateUserById(biz.user_id, { password, user_metadata: { must_change_password: true } });
    if (upd.error) throw new Error("auth_update_failed");
    await must(d.db.from("businesses").update({ must_change_password: true, password_changed_at: null }).eq("id", businessId));
    await audit(c, {
      action: "business.password_reset", targetType: "business", targetId: businessId, businessId,
      after: { sellerId: biz.seller_id, mustChangePassword: true }, reason,
    });

    let smsSent = false;
    try {
      smsSent = await d.sms(biz.phone, `EpicMKT: your password was reset. Seller ID ${biz.seller_id}, temporary password ${password}. Log in and change it now.`);
      await d.mail(biz.email, "Your EpicMKT password was reset", `<p>Seller ID: <b>${escapeHtml(biz.seller_id)}</b><br>Temporary password: <b>${escapeHtml(password)}</b></p><p>Log in and change your password now.</p>`);
    } catch (_) {}

    return json({ ok: true, businessId, sellerId: biz.seller_id, smsSent });
  });
