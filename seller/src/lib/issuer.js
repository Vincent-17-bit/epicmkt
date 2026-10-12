// The issuer block printed on receipts. Only what is configured is shown.
const env = import.meta.env ?? {};
export const ISSUER = {
  name: "EpicMKT",
  website: env.VITE_ISSUER_WEBSITE || "epicmkt.app",
  email: env.VITE_ISSUER_EMAIL || null,
  phone: env.VITE_ISSUER_PHONE || null,
  address: env.VITE_ISSUER_ADDRESS || null,
  pin: env.VITE_ISSUER_PIN || null,
};
