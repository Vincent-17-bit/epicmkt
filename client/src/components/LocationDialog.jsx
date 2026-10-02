import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationCrosshairs, faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { TOWNS } from "@epicmkt/shared";
import { useGeoStore } from "../stores/geo.js";
import Button from "./Button.jsx";
import styles from "./LocationDialog.module.css";

export default function LocationDialog() {
  const ref = useRef(null);
  const open = useGeoStore((s) => s.explaining);
  const status = useGeoStore((s) => s.status);
  const source = useGeoStore((s) => s.source);
  const town = useGeoStore((s) => s.town);
  const allow = useGeoStore((s) => s.allow);
  const chooseTown = useGeoStore((s) => s.chooseTown);
  const close = useGeoStore((s) => s.close);
  const blocked = status === "denied" || status === "unsupported";
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open) {
      setPicking(blocked || source === "town");
      setChoice(town ?? "");
    }
  }, [open]);

  useEffect(() => {
    if (open && blocked) setPicking(true);
  }, [open, blocked]);

  const submit = (event) => {
    event.preventDefault();
    if (choice) chooseTown(choice);
  };

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="location-title"
      onClose={close}
      onClick={(event) => event.target === ref.current && close()}
    >
      <div className={styles.body}>
        <span className={styles.icon}>
          <FontAwesomeIcon icon={faLocationDot} />
        </span>
        <h2 id="location-title" className={styles.title}>
          {blocked ? "Location is turned off" : picking ? "Choose your town" : "Why we ask for your location"}
        </h2>

        {blocked && (
          <p>
            {status === "unsupported"
              ? "This browser cannot share your location."
              : "Your browser did not share your location."}{" "}
            Pick your nearest town instead and we will use that.
          </p>
        )}

        {!blocked && !picking && (
          <>
            <p>EpicMKT uses your location only to show how far each business is from you and to list the closest ones first.</p>
            <ul className={styles.points}>
              <li>Your browser will ask for permission next. You can say no.</li>
              <li>Distances are straight-line, not road distance.</li>
              <li>Prefer not to share? Choose your town instead.</li>
            </ul>
          </>
        )}

        {picking && (
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
              <span className={styles.label}>Your town</span>
              <select className={styles.select} value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">Select a town</option>
                {TOWNS.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}, {t.county}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.hint}>We remember your choice on this device. Distances are straight-line from the middle of the town.</p>
            <div className={styles.actions}>
              <Button type="submit" disabled={!choice}>
                Use this town
              </Button>
              {!blocked && (
                <Button variant="secondary" icon={faLocationCrosshairs} onClick={allow}>
                  Use my location
                </Button>
              )}
            </div>
          </form>
        )}

        {!blocked && !picking && (
          <div className={styles.actions}>
            <Button icon={faLocationCrosshairs} onClick={allow}>
              Continue
            </Button>
            <Button variant="secondary" onClick={() => setPicking(true)}>
              Choose my town
            </Button>
          </div>
        )}

        <button type="button" className={styles.dismiss} onClick={close}>
          Not now
        </button>
      </div>
    </dialog>
  );
}
