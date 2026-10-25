import { useEffect, useState } from "react";
import { isValidSlug } from "@epicmkt/shared";
import { qrDataUrl } from "../lib/qrImage.js";

// Same recipe as the customer page and the poster, so all three always show the same code.
export default function ShopQr({ slug, planKey, hasLogo, label }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!isValidSlug(slug)) return undefined;
    let live = true;
    qrDataUrl(slug, { planKey, hasLogo })
      .then((u) => live && setSrc(u))
      .catch(() => live && setSrc(""));
    return () => {
      live = false;
    };
  }, [slug, planKey, hasLogo]);
  return (
    <div style={{ width: "9rem", aspectRatio: "1", padding: "0.5rem", borderRadius: "0.5rem", background: "white" }} data-testid="shop-qr">
      {src ? <img src={src} alt={label} width="512" height="512" decoding="async" style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated" }} /> : null}
    </div>
  );
}
