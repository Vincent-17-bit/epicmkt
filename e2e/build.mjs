import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  VITE_API_MODE: "mock",
  VITE_SUPABASE_URL: "",
  VITE_SUPABASE_ANON_KEY: "",
  VITE_TURNSTILE_SITE_KEY: "",
  VITE_CONTACT_EMAIL: "hello@epicmkt.example",
  VITE_CONTACT_PHONE: "0700000000",
  VITE_CONTACT_WHATSAPP: "0700000000",
  VITE_CONTACT_TOWN: "Nairobi, Kenya",
  VITE_SUPPORT_HOURS: "Mon to Fri, 8:00 AM to 5:00 PM (EAT)",
  VITE_SOCIAL_FACEBOOK: "https://facebook.com/epicmkt",
  VITE_SOCIAL_INSTAGRAM: "https://instagram.com/epicmkt",
  VITE_SOCIAL_TIKTOK: "https://tiktok.com/@epicmkt",
  VITE_SOCIAL_X: "https://x.com/epicmkt",
  VITE_SELLER_URL: "/seller/"
};

const apps = process.argv.length > 2 ? process.argv.slice(2) : ["client", "seller", "admin"];
for (const app of apps) {
  const run = spawnSync("npm", ["run", "build", "-w", app], { stdio: "inherit", env, shell: process.platform === "win32" });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
