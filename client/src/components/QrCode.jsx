import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { shopQrSpec } from "@epicmkt/shared";
import styles from "./QrCode.module.css";

// The same code the seller sees on their preview and prints on their poster: same link, same recipe.
// It redraws whenever the shop's link, plan or logo changes. The image is a PNG data URL, never HTML.
export default function QrCode({ slug, plan, hasLogo = false, label }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let live = true;
    const { text, ecl } = shopQrSpec(slug, { planKey: plan, hasLogo, site: import.meta.env?.VITE_SITE_URL });
    QRCode.toDataURL(text, { margin: 1, width: 512, errorCorrectionLevel: ecl })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(""));
    return () => {
      live = false;
    };
  }, [slug, plan, hasLogo]);

  return (
    <div className={styles.qr}>
      {src ? <img src={src} alt={label} width="512" height="512" decoding="async" /> : null}
    </div>
  );
}
