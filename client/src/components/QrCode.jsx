import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "./QrCode.module.css";

// Renders the code as a PNG data URL in an <img>. Nothing from the library is ever parsed as HTML.
export default function QrCode({ value, label }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { margin: 1, width: 512, errorCorrectionLevel: "M" })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(""));
    return () => {
      live = false;
    };
  }, [value]);

  return (
    <div className={styles.qr}>
      {src ? <img src={src} alt={label} width="512" height="512" decoding="async" /> : null}
    </div>
  );
}
