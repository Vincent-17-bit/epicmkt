import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCamera,
  faCircleCheck,
  faCircleInfo,
  faCloudArrowUp,
  faFilePdf,
  faRotate,
  faSpinner,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { useFormContext, useWatch } from "react-hook-form";
import { ErrorLine } from "./Field.jsx";
import { documentCards } from "./slots.js";
import { MAX_FILES } from "../../shared/validators.js";
import { FILE_ERRORS } from "../../shared/fileSecurity.js";
import form from "./form.module.css";
import styles from "./documents.module.css";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Slot({ card, entry, docs, showErrors }) {
  const input = useRef(null);
  const camera = useRef(null);
  const [over, setOver] = useState(false);
  const [why, setWhy] = useState(false);
  const id = `slot-${card.key}`;
  const busy = entry?.status === "working";
  const missing = showErrors && card.state === "required" && !entry?.file && !busy;
  const error = entry?.error || (missing ? "This document is required" : "");

  const take = (files) => {
    const file = files?.[0];
    if (file) docs.add(card.key, file);
  };

  return (
    <div className={styles.slot} data-invalid={error ? "true" : undefined} id={id}>
      <div className={styles.slotHead}>
        <h4>
          {card.label}
          {card.state === "optional" && <span className={styles.opt}> (optional)</span>}
        </h4>
        <button type="button" className={styles.whyBtn} aria-expanded={why} aria-controls={`${id}-why`} onClick={() => setWhy(!why)}>
          <FontAwesomeIcon icon={faCircleInfo} /> Why we need this
        </button>
      </div>
      {why && (
        <p id={`${id}-why`} className={styles.why}>
          {card.why}
        </p>
      )}
      {entry?.file ? (
        <div className={styles.filled}>
          {entry.preview ? (
            <img src={entry.preview} alt="" className={styles.thumb} />
          ) : (
            <span className={styles.pdf}>
              <FontAwesomeIcon icon={faFilePdf} />
            </span>
          )}
          <div className={styles.meta}>
            <span className={styles.fname}>{entry.file.name}</span>
            <span className={styles.fsize}>
              <FontAwesomeIcon icon={faCircleCheck} /> {size(entry.file.size)}
            </span>
          </div>
          <button type="button" className={styles.act} onClick={() => input.current.click()} aria-label={`Replace ${card.label}`}>
            <FontAwesomeIcon icon={faRotate} />
            <span>Replace</span>
          </button>
          <button type="button" className={styles.act} onClick={() => docs.remove(card.key)} aria-label={`Remove ${card.label}`}>
            <FontAwesomeIcon icon={faTrash} />
            <span>Remove</span>
          </button>
        </div>
      ) : (
        <div
          className={styles.drop}
          data-over={over ? "true" : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files);
          }}
        >
          {busy ? (
            <p role="status">
              <FontAwesomeIcon icon={faSpinner} spin /> Checking and compressing
            </p>
          ) : (
            <>
              <FontAwesomeIcon icon={faCloudArrowUp} className={styles.dropIcon} />
              <p>{over ? "Drop the file here" : "Drag a file here, or"}</p>
              <div className={styles.dropBtns}>
                <button type="button" className={styles.browse} onClick={() => input.current.click()}>
                  Browse files
                </button>
                <button type="button" className={`${styles.browse} ${styles.phoneOnly}`} onClick={() => camera.current.click()}>
                  <FontAwesomeIcon icon={faCamera} /> Take photo
                </button>
              </div>
              <p className={styles.formats}>PDF, JPG, PNG or WebP. Photos up to 10 MB, PDFs up to 8 MB.</p>
            </>
          )}
        </div>
      )}
      <input ref={input} type="file" hidden accept={ACCEPT} aria-label={`Choose file for ${card.label}`} onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      <input ref={camera} type="file" hidden accept="image/*" capture="environment" aria-label={`Take photo for ${card.label}`} onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      <ErrorLine message={error} />
    </div>
  );
}

export default function DocumentsStep({ category, docs, showErrors }) {
  const { control, setValue } = useFormContext();
  const values = useWatch({ control });
  const cards = documentCards(category, values);
  const registered = values.business?.registered;
  const count = Object.values(docs.files).filter((f) => f.file).length;
  const groups = [...new Set(cards.map((c) => c.group))];

  return (
    <div className={styles.wrap}>
      {registered === false && (
        <p className={styles.calm}>
          <FontAwesomeIcon icon={faCircleInfo} /> Your business is not registered, so only your ID, permit and signboard photo are needed. Your listing will show without the Verified tick until you add registration documents. If you give us everything, we can verify the business.
        </p>
      )}
      <p className={styles.count}>
        {count} of {MAX_FILES} files added. {FILE_ERRORS.blocked_type.split(".")[0]}.
      </p>
      {groups.map((group) => (
        <section key={group} aria-label={group}>
          <h3 className={styles.group}>{group === "You" ? "About you" : group === "Business" ? "Your business" : group}</h3>
          <div className={styles.slots}>
            {cards
              .filter((c) => c.group === group)
              .map((card) => (
                <div key={card.key} className={styles.slotWrap}>
                  {card.conditionKey && (
                    <label className={form.checkRow}>
                      <input
                        type="checkbox"
                        checked={!!values.conditionalDocs?.[card.conditionKey]}
                        onChange={(e) => {
                          setValue(`conditionalDocs.${card.conditionKey}`, e.target.checked, { shouldDirty: true });
                          if (!e.target.checked) docs.remove(card.key);
                        }}
                      />
                      <span>{card.condition}</span>
                    </label>
                  )}
                  {card.active && <Slot card={card} entry={docs.files[card.key]} docs={docs} showErrors={showErrors} />}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
