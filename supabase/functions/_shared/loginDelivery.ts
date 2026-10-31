import type { AdminDeps } from "./adminKit.ts";
import { emailHtml } from "./emailTemplate.ts";
import type { Msg } from "./messages.ts";

export const LOGIN_TEMPLATE = "login_details";
const RECORD_BODY = "Login details were sent. The temporary password is never stored.";

export type LoginDelivery = { smsSent: boolean; emailSent: boolean };

type Target = {
  businessId: string;
  applicationId?: string | null;
  phone: string;
  email: string | undefined;
  msg: Msg;
  password: string;
  actorId: string | null;
};

const failure = (e: unknown, password: string) =>
  String((e as { message?: string })?.message ?? e ?? "send_failed").split(password).join("***").slice(0, 200);

async function attempt(send: () => Promise<unknown>, password: string): Promise<string | null> {
  try {
    return (await send()) === false ? "not_sent" : null;
  } catch (e) {
    return failure(e, password);
  }
}

export async function deliverLogin(d: AdminDeps, t: Target): Promise<LoginDelivery> {
  const [smsError, emailError] = await Promise.all([
    attempt(() => d.sms(t.phone, t.msg.sms), t.password),
    attempt(() => d.mail(t.email, t.msg.subject, emailHtml(t.msg.email)), t.password),
  ]);
  const now = d.now().toISOString();
  const rows = [
    { channel: "sms", to: t.phone, subject: null, error: smsError },
    { channel: "email", to: t.email ?? null, subject: t.msg.subject, error: emailError },
  ].map((r) => ({
    business_id: t.businessId, application_id: t.applicationId ?? null, channel: r.channel, kind: "general", template_key: LOGIN_TEMPLATE,
    to_address: r.to, subject: r.subject, body: RECORD_BODY, status: r.error ? "failed" : "sent", attempts: 1, error: r.error,
    transactional: true, scheduled_at: now, sent_at: r.error ? null : now, created_by: t.actorId,
  }));
  try {
    const saved = await d.db.from("messages").insert(rows).select("id");
    if (saved.error) throw new Error("db_failed");
    const ids: { id: string }[] = saved.data ?? [];
    const alerts = rows.flatMap((r, i) => r.error
      ? [{ kind: "message_failed", business_id: t.businessId, data: { message_id: ids[i]?.id ?? null, channel: r.channel, attempts: 1, error: r.error, subject: r.subject, template_key: LOGIN_TEMPLATE, application_id: t.applicationId ?? null } }]
      : []);
    if (alerts.length) {
      const flagged = await d.db.from("admin_notifications").insert(alerts);
      if (flagged.error) throw new Error("db_failed");
    }
  } catch (e) {
    console.error("login delivery not recorded", (e as Error).message);
  }
  return { smsSent: !smsError, emailSent: !emailError };
}
