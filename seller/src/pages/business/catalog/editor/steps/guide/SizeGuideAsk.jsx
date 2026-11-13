import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRulerCombined } from "@fortawesome/free-solid-svg-icons";
import s from "./guide.module.css";

// Shown in Details for an item that has no Size guide step yet: one clear way to add one to any item.
export default function SizeGuideAsk({ onAdd }) {
  return (
    <div className={s.ask} data-testid="size-guide-ask">
      <span className={s.startIcon} aria-hidden="true"><FontAwesomeIcon icon={faRulerCombined} /></span>
      <div className={s.askText}>
        <p className={s.startTitle}>Does your item come in sizes?</p>
        <p className={s.muted}>Add a size guide so buyers can pick the right one. It shows as a Size chart link on your item.</p>
      </div>
      <button type="button" className={s.pill} onClick={onAdd}>Add a size guide</button>
    </div>
  );
}
