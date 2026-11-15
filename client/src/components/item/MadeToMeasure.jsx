import { useId } from "react";
import CustomSize from "./CustomSize.jsx";
import styles from "./MadeToMeasure.module.css";

/**
 * The "Made to measure" choice under an item's options. It appears only when the seller turned it on. A switch opens the measurement form;
 * once every measurement is valid the page shows the seller's price for it and the chat message says exactly what was chosen.
 * `custom` comes from the item page: { config, on, setOn, setResult }.
 */
export default function MadeToMeasure({ item, custom }) {
  const uid = useId();
  if (!custom?.config?.enabled) return null;
  return (
    <section className={styles.wrap} aria-label="Made to measure">
      <div className={styles.row}>
        <button type="button" role="switch" aria-checked={custom.on} aria-describedby={`${uid}-d`} className={styles.switch} onClick={() => custom.setOn(!custom.on)}>
          <span className={styles.knob} aria-hidden="true" />
          <span className={styles.label}>Made to measure</span>
        </button>
        <p id={`${uid}-d`} className={styles.hint}>{custom.on ? "Give your measurements below." : "Not in the sizes shown? Ask for it made to fit you."}</p>
      </div>
      {custom.on && <CustomSize config={custom.config} itemName={item?.name ?? ""} onChange={custom.setResult} />}
    </section>
  );
}
