// Tell Safaricom where to send Paybill payments. Run once per environment (and again if the URL changes):
//   node --env-file=scripts/.env scripts/register-mpesa-c2b.mjs
// Needs the variables in the "[scripts] M-Pesa" block of .env.example.
// Safaricom rejects callback URLs that contain words like "mpesa" or "safaricom", which is why the function is named pay-callback.

const need = ["MPESA_ENV", "MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_CALLBACK_SECRET", "SUPABASE_URL"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const env = process.env.MPESA_ENV;
if (!["sandbox", "production"].includes(env)) {
  console.error("MPESA_ENV must be sandbox or production.");
  process.exit(1);
}
const host = env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
const base = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/pay-callback/${encodeURIComponent(process.env.MPESA_CALLBACK_SECRET)}`;

const basic = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");
const tokenRes = await fetch(`${host}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` } });
if (!tokenRes.ok) {
  console.error(`Could not get a Safaricom token (${tokenRes.status}). Check the consumer key and secret.`);
  process.exit(1);
}
const { access_token } = await tokenRes.json();

const res = await fetch(`${host}/mpesa/c2b/v2/registerurl`, {
  method: "POST",
  headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    ShortCode: process.env.MPESA_SHORTCODE,
    // Completed: accept a payment even if our validation URL is unreachable. We never block a payer.
    ResponseType: "Completed",
    ConfirmationURL: `${base}/confirmation`,
    ValidationURL: `${base}/validation`,
  }),
});
const out = await res.json().catch(() => ({}));
console.log(res.status, JSON.stringify(out));
process.exit(res.ok ? 0 : 1);
