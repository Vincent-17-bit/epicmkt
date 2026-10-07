import { lazy, Suspense, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationCrosshairs, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button, Skeleton } from "@epicmkt/ui";
import { ErrorLine, Field, TextField } from "./Field.jsx";
import form from "./form.module.css";
import styles from "./steps.module.css";

const MapPicker = lazy(() => import("./MapPicker.jsx"));

const COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado",
  "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
  "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi", "Nakuru", "Nandi",
  "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
  "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot"
];

export default function LocationStep() {
  const { control, setValue, register, formState } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: "contacts.businessPhones" });
  const lat = useWatch({ control, name: "location.lat" });
  const lng = useWatch({ control, name: "location.lng" });
  const same = useWatch({ control, name: "contacts.whatsappSame" });
  const [geoError, setGeoError] = useState("");
  const pinError = formState.errors.location?.lat?.message || formState.errors.location?.lng?.message;

  const setPin = ({ lat: a, lng: b }) => {
    setValue("location.lat", a, { shouldDirty: true, shouldValidate: true });
    setValue("location.lng", b, { shouldDirty: true, shouldValidate: true });
  };

  const locate = () => {
    setGeoError("");
    if (!navigator.geolocation) return setGeoError("This device cannot share its location. Tap the map instead.");
    navigator.geolocation.getCurrentPosition(
      (p) => setPin({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }),
      () => setGeoError("We could not get your location. Allow location access or tap the map instead."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  return (
    <div className={form.grid}>
      <Field name="location.county" label="County">
        {(aria) => (
          <select className={form.input} {...aria} {...register("location.county")}>
            <option value="">Choose a county</option>
            {COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </Field>
      <TextField name="location.town" label="Town or area" />
      <TextField name="location.address" label="Address or landmark" className={form.span2} hint="For example, next to the Maseno market gate" />

      <div className={`${styles.mapBlock} ${form.span2}`}>
        <div className={styles.mapHead}>
          <div>
            <strong>Pin your business on the map</strong>
            <p className={styles.note}>Tap the map or drag the pin. Use the arrow keys to move it in small steps.</p>
          </div>
          <Button variant="secondary" size="sm" icon={faLocationCrosshairs} onClick={locate}>
            Use my current location
          </Button>
        </div>
        <Suspense fallback={<Skeleton height="320px" radius="12px" />}>
          <MapPicker value={lat != null && lng != null ? { lat, lng } : null} onChange={setPin} />
        </Suspense>
        <div className={form.grid}>
          <div className={form.field}>
            <label className={form.label} htmlFor="pin-lat">Latitude</label>
            <input id="pin-lat" className={form.input} readOnly value={lat ?? ""} aria-invalid={pinError ? true : undefined} />
          </div>
          <div className={form.field}>
            <label className={form.label} htmlFor="pin-lng">Longitude</label>
            <input id="pin-lng" className={form.input} readOnly value={lng ?? ""} aria-invalid={pinError ? true : undefined} />
          </div>
        </div>
        <ErrorLine message={pinError || geoError} />
      </div>

      <div className={`${styles.phones} ${form.span2}`}>
        {fields.map((f, i) => (
          <div key={f.id} className={styles.listRow}>
            <TextField
              name={`contacts.businessPhones.${i}`}
              label={i === 0 ? "Business phone" : `Business phone ${i + 1}`}
              type="tel"
              inputMode="tel"
              className={styles.grow}
              hint={i === 0 ? "Customers call this number" : undefined}
            />
            {i > 0 && (
              <button type="button" className={styles.iconBtn} aria-label={`Remove business phone ${i + 1}`} onClick={() => remove(i)}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>
        ))}
        {fields.length < 3 && (
          <button type="button" className={styles.addBtn} onClick={() => append("")}>
            <FontAwesomeIcon icon={faPlus} /> Add another phone
          </button>
        )}
      </div>

      <div className={`${styles.phones} ${form.span2}`}>
        <TextField name="contacts.whatsapp" label="WhatsApp number" type="tel" inputMode="tel" disabled={same} />
        <label className={form.checkRow}>
          <input
            type="checkbox"
            {...register("contacts.whatsappSame", {
              onChange: (e) => e.target.checked && setValue("contacts.whatsapp", "", { shouldValidate: true })
            })}
          />
          <span>Same as my first business phone</span>
        </label>
      </div>

      <TextField name="contacts.website" label="Website" type="url" inputMode="url" optional placeholder="https://" />
      <TextField name="contacts.socials.facebook" label="Facebook link" type="url" optional />
      <TextField name="contacts.socials.instagram" label="Instagram link" type="url" optional />
      <TextField name="contacts.socials.x" label="X link" type="url" optional />
      <TextField name="contacts.socials.tiktok" label="TikTok link" type="url" optional />
    </div>
  );
}
