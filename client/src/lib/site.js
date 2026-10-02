import { faFacebook, faInstagram, faTiktok, faXTwitter } from "@fortawesome/free-brands-svg-icons";

const env = import.meta.env;

export const site = {
  email: env.VITE_CONTACT_EMAIL || "",
  phone: env.VITE_CONTACT_PHONE || "",
  whatsapp: env.VITE_CONTACT_WHATSAPP || "",
  town: env.VITE_CONTACT_TOWN || "",
  supportHours: env.VITE_SUPPORT_HOURS || "",
  socials: [
    { key: "facebook", label: "Facebook", icon: faFacebook, href: env.VITE_SOCIAL_FACEBOOK },
    { key: "instagram", label: "Instagram", icon: faInstagram, href: env.VITE_SOCIAL_INSTAGRAM },
    { key: "tiktok", label: "TikTok", icon: faTiktok, href: env.VITE_SOCIAL_TIKTOK },
    { key: "x", label: "X", icon: faXTwitter, href: env.VITE_SOCIAL_X }
  ].filter((s) => s.href)
};
