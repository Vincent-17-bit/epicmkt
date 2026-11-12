import { useEffect, useId, useState } from "react";
import { shoeTable } from "@epicmkt/shared";
import { items } from "../../api/index.js";
import { t } from "../../i18n/index.js";
import styles from "./SizeChartModal.module.css";

const AUDIENCES = [
  { id: "men", label: "sizeChart.men" },
  { id: "women", label: "sizeChart.women" },
  { id: "kids", label: "sizeChart.kids" }
];

// The shoe conversion table shown under a shoe size chart: EU, UK, US and foot length in cm, for men, women or kids.
export default function ShoeConversionTable() {
  const [chart, setChart] = useState(null);
  const [who, setWho] = useState("men");
  const id = useId();

  useEffect(() => {
    let live = true;
    items.getShoeConversion().then((r) => live && setChart(r.chart));
    return () => { live = false; };
  }, []);

  if (!chart) return null;
  const rows = shoeTable(chart, who);
  const kids = who === "kids";
  const move = (event) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const i = AUDIENCES.findIndex((a) => a.id === who);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    setWho(AUDIENCES[(i + step + AUDIENCES.length) % AUDIENCES.length].id);
  };
  return (
    <section className={styles.shoe}>
      <h3 id={id} className={styles.shoeTitle}>{t("sizeChart.shoeTitle")}</h3>
      <div role="radiogroup" aria-labelledby={id} className={styles.seg} onKeyDown={move}>
        {AUDIENCES.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={who === a.id} tabIndex={who === a.id ? 0 : -1} className={who === a.id ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn} onClick={() => setWho(a.id)}>
            {t(a.label)}
          </button>
        ))}
      </div>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label={t("sizeChart.shoeTitle")}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">EU</th>
              {!kids && <th scope="col">UK</th>}
              {!kids && <th scope="col">US</th>}
              <th scope="col">cm</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.eu}>
                <th scope="row">{r.eu}</th>
                {!kids && <td>{r.uk}</td>}
                {!kids && <td>{r.us}</td>}
                <td>{r.cm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.hint}>{t("sizeChart.shoeNote")}</p>
    </section>
  );
}
