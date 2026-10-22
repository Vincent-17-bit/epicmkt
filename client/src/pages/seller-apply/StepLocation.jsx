import { lazy, Suspense, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faLink,
  faLocationCrosshairs,
  faLocationDot,
  faMapLocationDot,
  faPhone,
  faPlus,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { useFormContext, useWatch } from "react-hook-form";
import Button from "../../components/Button.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import { ErrorLine, fieldId, MaskedField, SelectField, TextField } from "./Field.jsx";
import { phoneDisplay, phoneMask } from "./masks.js";
import form from "./form.module.css";
import styles from "./steps.module.css";

const MapPicker = lazy(() => import("./MapPicker.jsx"));

export const COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado",
  "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
  "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi", "Nakuru", "Nandi",
  "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
  "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot"
];

export default function LocationStep() {
  const { control, setValue, getValues, register, formState } = useFormContext();
  const phones = useWatch({ control, name: "contacts.businessPhones" }) ?? [""];
  const lat = useWatch({ control, name: "location.lat" });
  const lng = useWatch({ control, name: "location.lng" });
  const same = useWatch({ control, name: "contacts.whatsappSame" });
  const [geoError, setGeoError] = useState("");
  const [locating, setLocating] = useState(false);
  const pinError = formState.errors.location?.lat?.message || formState.errors.location?.lng?.message;
  const pinned = lat != null && lng != null;

  // One less thing to type: start the business phone from the number given on the "About you" step.
  useEffect(() => {
    const own = getValues("phone");
    const first = getValues("contacts.businessPhones.0");
    if (own && !String(first ?? "").trim()) setValue("contacts.businessPhones.0", own, { shouldDirty: true });
  }, []);

  const setPin = ({ lat: a, lng: b }) => {
    setGeoError("");
    setValue("location.lat", a, { shouldDirty: true, shouldValidate: true });
    setValue("location.lng", b, { shouldDirty: true, shouldValidate: true });
  };

  const locate = () => {
    setGeoError("");
    if (!navigator.geolocation) return setGeoError("This device cannot share its location. Tap the map instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setPin({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) });
      },
      () => {
        setLocating(false);
        setGeoError("We could not get your location. Allow location access, or tap the map instead.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const setPhones = (next) => setValue("contacts.businessPhones", next, { shouldDirty: true });

  return (
    <div className={styles.stack}>
      <section className={styles.block} aria-labelledby="where-title">
        <div className={styles.blockHead}>
          <span className={styles.blockIcon} aria-hidden="true">
            <FontAwesomeIcon icon={faLocationDot} />
          </span>
          <div>
            <h3 id="where-title">Address</h3>
            <p>So customers can find your shop.</p>
          </div>
        </div>
        <div className={form.grid}>
          <SelectField name="location.county" label="County" placeholder="Choose a county" options={COUNTIES} />
          <TextField name="location.town" label="Town or area" placeholder="For example Maseno" autoComplete="address-level2" />
          <TextField
            name="location.address"
            label="Address or landmark"
            className={form.span2}
            placeholder="For example Next to Maseno market gate, opposite the chemist"
            autoComplete="street-address"
            hint="Describe it the way you would to a boda rider."
          />
        </div>

        <div className={styles.mapBlock} id={fieldId("location.lat")} tabIndex={-1}>
          <div className={styles.mapHead}>
            <div>
              <strong>
                <FontAwesomeIcon icon={faMapLocationDot} /> Pin your shop on the map
              </strong>
              <p className={styles.note}>Tap the map or drag the pin. With a keyboard, use the arrow keys.</p>
            </div>
            <Button variant="secondary" size="sm" icon={faLocationCrosshairs} onClick={locate} disabled={locating}>
              {locating ? "Finding you" : "Use my location"}
            </Button>
          </div>
          <Suspense fallback={<Skeleton height="320px" radius="14px" />}>
            <MapPicker value={pinned ? { lat, lng } : null} onChange={setPin} />
          </Suspense>
          <p className={styles.pinState} data-set={pinned ? "true" : undefined} role="status">
            {pinned ? `Pin set at ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : "No pin yet"}
          </p>
          <ErrorLine message={pinError || geoError} />
        </div>
      </section>

      <section className={styles.block} aria-labelledby="reach-title">
        <div className={styles.blockHead}>
          <span className={styles.blockIcon} aria-hidden="true">
            <FontAwesomeIcon icon={faPhone} />
          </span>
          <div>
            <h3 id="reach-title">How customers reach you</h3>
            <p>These show on your listing as Call and WhatsApp buttons.</p>
          </div>
        </div>

        <div className={styles.phones}>
          {phones.map((_, i) => (
            <div key={i} className={styles.listRow}>
              <MaskedField
                name={`contacts.businessPhones.${i}`}
                label={i === 0 ? "Business phone" : `Business phone ${i + 1}`}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0712 345 678"
                className={styles.grow}
                hint={i === 0 ? "The number customers call. Filled in from your own number, change it if needed." : undefined}
                mask={phoneMask}
                tidy={phoneDisplay}
              />
              {i > 0 && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={`Remove business phone ${i + 1}`}
                  onClick={() => setPhones(phones.filter((_, k) => k !== i))}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              )}
            </div>
          ))}
          {phones.length < 3 && (
            <button type="button" className={styles.addBtn} onClick={() => setPhones([...phones, ""])}>
              <FontAwesomeIcon icon={faPlus} /> Add another phone
            </button>
          )}
        </div>

        <div className={styles.phones}>
          <label className={form.checkRow}>
            <input
              type="checkbox"
              {...register("contacts.whatsappSame", {
                onChange: (e) => e.target.checked && setValue("contacts.whatsapp", "", { shouldValidate: true })
              })}
            />
            <span>Customers can also WhatsApp me on my first business phone</span>
          </label>
          {!same && (
            <MaskedField
              name="contacts.whatsapp"
              label="WhatsApp number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              mask={phoneMask}
              tidy={phoneDisplay}
            />
          )}
        </div>

        <details className={form.more}>
          <summary>
            <FontAwesomeIcon icon={faLink} />
            <span>Website and social links</span>
            <span className={form.moreHint}>Optional</span>
            <FontAwesomeIcon icon={faChevronDown} className={form.moreChev} />
          </summary>
          <div className={`${form.grid} ${form.moreBody}`}>
            <TextField name="contacts.website" label="Website" type="url" inputMode="url" optional placeholder="https://yourshop.co.ke" className={form.span2} autoCapitalize="off" />
            <TextField name="contacts.socials.facebook" label="Facebook link" type="url" optional placeholder="https://facebook.com/yourshop" autoCapitalize="off" />
            <TextField name="contacts.socials.instagram" label="Instagram link" type="url" optional placeholder="https://instagram.com/yourshop" autoCapitalize="off" />
            <TextField name="contacts.socials.x" label="X link" type="url" optional placeholder="https://x.com/yourshop" autoCapitalize="off" />
            <TextField name="contacts.socials.tiktok" label="TikTok link" type="url" optional placeholder="https://tiktok.com/@yourshop" autoCapitalize="off" />
          </div>
        </details>
      </section>
    </div>
  );
}
