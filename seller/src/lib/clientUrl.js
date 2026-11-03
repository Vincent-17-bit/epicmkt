import { itemUrl, shopUrl } from "@epicmkt/shared";

const base = () => import.meta.env?.VITE_CLIENT_URL || import.meta.env?.VITE_SITE_URL || "";

export const clientItemUrl = (slug, itemId) => itemUrl(slug, itemId, base());

export const clientShopUrl = (slug) => shopUrl(slug, base());
