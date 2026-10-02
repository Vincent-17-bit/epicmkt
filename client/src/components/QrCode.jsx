import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "./QrCode.module.css";

export default function QrCode({ value, label }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((out) => live && setSvg(out));
    return () => {
      live = false;
    };
  }, [value]);

  return <div className={styles.qr} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
