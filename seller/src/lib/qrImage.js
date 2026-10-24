import { shopQrSpec } from "@epicmkt/shared";

// The same code the poster carries, as a PNG data URL. qrcode loads only when a code is first shown.
export async function qrDataUrl(slug, { planKey, hasLogo }) {
  const { default: QR } = await import("qrcode");
  const { text, ecl } = shopQrSpec(slug, { planKey, hasLogo, site: import.meta.env?.VITE_SITE_URL });
  return QR.toDataURL(text, { margin: 1, width: 512, errorCorrectionLevel: ecl });
}
