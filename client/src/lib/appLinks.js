import { joinUrl } from "@epicmkt/shared";

const env = import.meta.env;

export const APP_DEFAULTS = {
  sellerUrl: env.VITE_SELLER_URL || "http://localhost:5174",
  adminUrl: env.VITE_ADMIN_URL || "http://localhost:5175",
  sellerLoginPath: env.VITE_SELLER_LOGIN_PATH || "/login"
};

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");

export const resolveAppLinks = (config = {}) => {
  const sellerUrl = text(config.seller_url) || APP_DEFAULTS.sellerUrl;
  const adminUrl = text(config.admin_url) || APP_DEFAULTS.adminUrl;
  const sellerLoginPath = text(config.seller_login_path) || APP_DEFAULTS.sellerLoginPath;
  return { sellerUrl, adminUrl, sellerLoginPath, sellerLogin: joinUrl(sellerUrl, sellerLoginPath) };
};
