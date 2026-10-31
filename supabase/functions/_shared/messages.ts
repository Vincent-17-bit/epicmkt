export type Msg = { sms: string; subject: string; email: string };

export const clientUrl = () => Deno.env.get("CLIENT_URL") ?? "https://epicmkt-client.vercel.app";
export const sellerUrl = () => Deno.env.get("SELLER_URL") ?? "https://epicmkt-seller.vercel.app";
export const statusLink = () => `${clientUrl()}/become-a-seller/status`;
export const loginLink = () => `${sellerUrl()}/login`;

export const kes = (n: number | string) => `KES ${Number(n).toLocaleString("en-US")}`;

const hello = (name?: string | null) => {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `Hello ${first},` : "Hello,";
};

type Mpesa = { type?: string; number?: string; name?: string };

const payLines = (m: Mpesa, ref: string) =>
  m.type === "paybill"
    ? `Paybill number: ${m.number}\nAccount number: ${ref}`
    : `Till number: ${m.number}${m.name ? `\nTill name: ${m.name}` : ""}`;

const payTo = (m: Mpesa, ref: string) =>
  m.type === "paybill" ? `Paybill ${m.number}, Account ${ref}` : `Till ${m.number}${m.name ? ` (${m.name})` : ""}`;

export const otpSms = (code: string, minutes: number) =>
  `EpicMKT: Your code is ${code}. It expires in ${minutes} minutes. Never share it.`;

export const otpMail = (code: string, minutes: number) => ({
  subject: "Your EpicMKT code",
  text: `Hello,\n\nUse this code to continue. It expires in ${minutes} minutes.\n\nCode: ${code}\n\nIf you did not ask for it, you can ignore this email. Nobody can use your account without the code.`,
});

export const applicationReceived = (o: { owner?: string; business: string; ref: string }): Msg => ({
  sms: `EpicMKT: Application received for ${o.business}. Ref ${o.ref}. Track it at ${statusLink()}`,
  subject: `We received your application, ${o.business}`,
  email: `${hello(o.owner)}\n\nThank you for applying to sell on EpicMKT. We have received the application for ${o.business} and our team will review it.\n\nReference: ${o.ref}\n\nUse your reference number and phone number to check its progress at any time.\n\nCheck my application | ${statusLink()}`,
});

export const changesNeeded = (o: { owner?: string; business: string; ref: string; note?: string | null }): Msg => ({
  sms: `EpicMKT: ${o.business} needs a few updates before approval. See the details at ${statusLink()} (Ref ${o.ref}).`,
  subject: `Updates needed for ${o.business}`,
  email: `${hello(o.owner)}\n\nOur reviewers need a few updates to the application for ${o.business} before it can be approved.\n\n${o.note ? `Reviewer note: ${o.note}\n` : ""}Reference: ${o.ref}\n\nUpdate my application | ${statusLink()}`,
});

export const rejected = (o: { owner?: string; business: string; ref: string; reason: string }): Msg => ({
  sms: `EpicMKT: Your application ${o.ref} was not approved. Details are at ${statusLink()}`,
  subject: `Update on your application ${o.ref}`,
  email: `${hello(o.owner)}\n\nThank you for applying to sell on EpicMKT. After review, we are unable to approve the application for ${o.business} at this time.\n\nReason: ${o.reason}\nReference: ${o.ref}\n\nYou are welcome to apply again once this has been addressed.\n\nView my application | ${statusLink()}`,
});

export const approvedAwaitingPayment = (o: { owner?: string; business: string; ref: string; amount: number; mpesa: Mpesa }): Msg => ({
  sms: `EpicMKT: ${o.business} is approved. Pay ${kes(o.amount)} to ${payTo(o.mpesa, o.ref)}. Your login is sent once we receive it.`,
  subject: `${o.business} is approved. Complete your payment`,
  email: `${hello(o.owner)}\n\nCongratulations. The application for ${o.business} has been approved. To go live, please complete your first payment.\n\nAmount: ${kes(o.amount)}\n${payLines(o.mpesa, o.ref)}\n\nWe recognise your payment automatically, so there is no code to send. You may pay for several months at once. Your login details are sent as soon as the payment is received.`,
});

export const approvedPaid = (o: { owner?: string; business: string; ref: string }): Msg => ({
  sms: `EpicMKT: ${o.business} is approved and your payment is received. Your login details follow shortly.`,
  subject: `${o.business} is approved`,
  email: `${hello(o.owner)}\n\nCongratulations. The application for ${o.business} has been approved and your payment is received. We are confirming it now and will send your login details shortly.\n\nReference: ${o.ref}`,
});

export const verificationUpdate = (o: { owner?: string; business: string; ref: string; level: string }): Msg => ({
  sms: `EpicMKT: The verification status of ${o.business} is now ${o.level}.`,
  subject: `Verification update for ${o.business}`,
  email: `${hello(o.owner)}\n\nThe verification status of the application for ${o.business} is now ${o.level}.\n\nReference: ${o.ref}`,
});

export const backInReview = (o: { owner?: string; business: string; ref: string }): Msg => ({
  sms: `EpicMKT: Your application ${o.ref} is back in review. No action is needed.`,
  subject: `Your application ${o.ref} is back in review`,
  email: `${hello(o.owner)}\n\nThe application for ${o.business} is back in our review queue. No action is needed from you.\n\nReference: ${o.ref}`,
});

export const loginDetails = (o: { owner?: string; business: string; sellerId: string; password: string }): Msg => ({
  sms: `EpicMKT: Your business page is live. Seller ID ${o.sellerId}, temporary password ${o.password}. Sign in at ${loginLink()} and change it.`,
  subject: "Your EpicMKT seller login",
  email: `${hello(o.owner)}\n\n${o.business} is now live on EpicMKT. Use these details to sign in.\n\nSeller ID: ${o.sellerId}\nTemporary password: ${o.password}\n\nYou will be asked to choose your own password after signing in.\n\nSign in | ${loginLink()}`,
});

export const welcome = (o: { owner?: string; business: string; until: string }): Msg => ({
  sms: "",
  subject: `Welcome to EpicMKT, ${o.business}`,
  email: `${hello(o.owner)}\n\nWelcome to EpicMKT. Your business page is live until ${o.until}.\n\nTo get started:\n1. Sign in with your Seller ID.\n2. Add your items under Catalog.\n3. Add your email and choose your own password under Account.\n\nSign in | ${loginLink()}`,
});

export const passwordReset = (o: { sellerId: string; password: string }): Msg => ({
  sms: `EpicMKT: Your password was reset. Seller ID ${o.sellerId}, temporary password ${o.password}. Sign in at ${loginLink()} and change it now.`,
  subject: "Your EpicMKT password was reset",
  email: `Hello,\n\nAn EpicMKT administrator reset your password. Use these details to sign in.\n\nSeller ID: ${o.sellerId}\nTemporary password: ${o.password}\n\nYou will be asked to choose a new password after signing in.\n\nSign in | ${loginLink()}`,
});

export const paymentConfirmed = (o: { business: string; amount: number; until: string; receipt: string }) => ({
  sms: `EpicMKT: ${kes(o.amount)} received. ${o.business} is paid until ${o.until}. Receipt ${o.receipt}.`,
  inApp: `${kes(o.amount)} received. ${o.business} is paid until ${o.until}. Receipt ${o.receipt}.`,
  subject: `Payment received. Receipt ${o.receipt}`,
  email: `Hello,\n\nThank you. We have confirmed your payment for ${o.business}.\n\nAmount: ${kes(o.amount)}\nPaid until: ${o.until}\nReceipt: ${o.receipt}`,
});

export const signInEmailChanged = (masked: string) => ({
  subject: "Your EpicMKT sign-in email was changed",
  text: `Hello,\n\nThe sign-in email on your EpicMKT account was changed to ${masked}.\n\nIf this was not you, contact EpicMKT support immediately.`,
});
