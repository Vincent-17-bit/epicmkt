import { useEffect, useRef, useState } from "react";
import { faLocationCrosshairs, faRotateLeft, faXmark } from "@fortawesome/free-solid-svg-icons";
import { TOWNS } from "@epicmkt/shared";
import { useGeoStore } from "../stores/geo.js";
import { showToast } from "../stores/toast.js";
import Button from "./Button.jsx";
import IconButton from "./IconButton.jsx";
import styles from "./LocationDialog.module.css";

export default function LocationDialog() {
  const ref = useRef(null);
  const open = useGeoStore((s) => s.explaining);
  const status = useGeoStore((s) => s.status);
  const source = useGeoStore((s) => s.source);
  const town = useGeoStore((s) => s.town);
  const deviceBlocked = useGeoStore((s) => s.deviceBlocked);
  const allow = useGeoStore((s) => s.allow);
  const chooseTown = useGeoStore((s) => s.chooseTown);
  const close = useGeoStore((s) => s.close);
  const reset = useGeoStore((s) => s.reset);
  const [choice, setChoice] = useState("");
  const isSet = status === "granted";
  const canLocate = typeof navigator !== "undefined" && "geolocation" in navigator && !deviceBlocked;

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open) setChoice(town ?? "");
  }, [open]);

  const submit = (event) => {
    event.preventDefault();
    if (choice) chooseTown(choice);
  };

  const clear = () => {
    reset();
    showToast("Location reset");
  };

  const current = !isSet ? null : source === "town" && town ? town : "Your approximate location";

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="location-title"
      onClose={close}
      onClick={(event) => event.target === ref.current && close()}
    >
      <div className={styles.body}>
        <div className={styles.head}>
          <div className={styles.titles}>
            <h2 id="location-title" className={styles.title}>
              Your location
            </h2>
            <p className={styles.sub}>{current ?? "Used only to show distance."}</p>
          </div>
          <IconButton icon={faXmark} label="Close" onClick={close} />
        </div>

        {canLocate ? (
          <Button icon={faLocationCrosshairs} disabled={status === "asking"} onClick={allow}>
            Use my location
          </Button>
        ) : (
          <p className={styles.note} role="status">
            Location is blocked in this browser.
          </p>
        )}

        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <span className={styles.label}>{canLocate ? "Or choose a town" : "Choose a town"}</span>
            <select className={styles.select} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Select a town</option>
              {TOWNS.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}, {t.county}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant={canLocate ? "secondary" : "primary"} disabled={!choice || choice === town}>
            Use this town
          </Button>
        </form>

        {isSet && (
          <Button variant="ghost" icon={faRotateLeft} onClick={clear}>
            Reset location
          </Button>
        )}
      </div>
    </dialog>
  );
}
