import { useRef, useState } from "react";
import { t } from "../../i18n/index.js";
import SizeChartModal from "./SizeChartModal.jsx";
import styles from "./SizeChartModal.module.css";

/** "Size chart" link for the size selector. Hidden when the item has no chart. Focus goes back to the link when the dialog closes. */
export default function SizeChartLink({ chart, extra = null }) {
  const [open, setOpen] = useState(false);
  const link = useRef(null);
  if (!chart || !Array.isArray(chart.rows) || chart.rows.length === 0) return null;
  const close = () => {
    setOpen(false);
    link.current?.focus();
  };
  return (
    <>
      <button ref={link} type="button" className={styles.link} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M3 8.5h18v7H3zM7 8.5v3M11 8.5v4M15 8.5v3M19 8.5v4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t("sizeChart.link")}
      </button>
      <SizeChartModal chart={chart} open={open} onClose={close} extra={extra} />
    </>
  );
}
