export const OTP_MINUTES = 10;

export type OtpChannel = "sms" | "email";
export type OtpTarget = { phone: string; email?: string | null };
export type OtpOutcome = { channel: OtpChannel | null; fellBack: boolean };
export type OtpSenders = {
  sms: (to: string, message: string) => Promise<boolean>;
  email: (to: string, subject: string, html: string) => Promise<boolean>;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseChannel = (v: unknown): OtpChannel => (v === "email" ? "email" : "sms");

export const otpMessage = (code: string) => `Your EpicMKT code is ${code}. It expires in ${OTP_MINUTES} minutes.`;

export const otpEmail = (code: string) => ({
  subject: "Your EpicMKT verification code",
  html:
    `<p>Your EpicMKT code is:</p>` +
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>` +
    `<p>It expires in ${OTP_MINUTES} minutes. If you did not ask for it, ignore this email and do not share the code.</p>`,
});

export const maskEmail = (email: string) => email.replace(/^(.).*(@.*)$/, "$1***$2");

const attempt = async (send: () => Promise<boolean>) => {
  try {
    return await send();
  } catch {
    return false;
  }
};

/** SMS is the default. Email is used when asked for, or when the SMS could not be handed to the provider. */
export async function dispatchOtp(senders: OtpSenders, target: OtpTarget, code: string, requested: OtpChannel = "sms"): Promise<OtpOutcome> {
  const to = typeof target.email === "string" && EMAIL.test(target.email) ? target.email : null;
  const { subject, html } = otpEmail(code);
  const mail = to ? () => attempt(() => senders.email(to, subject, html)) : null;

  if (requested === "email") return { channel: mail && (await mail()) ? "email" : null, fellBack: false };
  if (await attempt(() => senders.sms(target.phone, otpMessage(code)))) return { channel: "sms", fellBack: false };
  if (mail && (await mail())) return { channel: "email", fellBack: true };
  return { channel: null, fellBack: false };
}
