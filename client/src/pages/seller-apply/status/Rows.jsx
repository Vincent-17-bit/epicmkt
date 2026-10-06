import { useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faCircleCheck, faFilePdf, faFlag, faRotate } from "@fortawesome/free-solid-svg-icons";
import { prepareFile } from "../../../shared/fileSecurity.js";
import { ErrorLine } from "../Field.jsx";
import { show, sizeText } from "./statusMeta.js";
import form from "../form.module.css";
import styles from "./status.module.css";

export function flagState(flag) {
  if (!flag) return null;
  if (flag.status === "confirmed") return "confirmed";
  if (flag.status === "fixed" || flag.addressed) return "fixed";
  return "open";
}

export function FlagNote({ flag, state }) {
  if (!flag || state === "confirmed") return null;
  if (state === "fixed") {
    return (
      <p className={styles.fixed}>
        <FontAwesomeIcon icon={faCircleCheck} />
        <span>Fixed, waiting for re-check</span>
      </p>
    );
  }
  return (
    <div className={styles.flagNote}>
      <p className={styles.flagLabel}>
        <FontAwesomeIcon icon={faFlag} />
        <span>Needs correction</span>
      </p>
      <p className={styles.flagMessage}>{flag.message}</p>
    </div>
  );
}

function inputFor(path, current) {
  if (path === "business.sbpExpiry") return { type: "date" };
  if (path === "business.yearEstablished" || path === "location.lat" || path === "location.lng") return { type: "number", step: "any" };
  if (path === "email") return { type: "email" };
  if (["phone", "altPhone", "contacts.whatsapp"].includes(path)) return { type: "tel", inputMode: "tel" };
  if (path === "contacts.website") return { type: "url" };
  if (typeof current === "number") return { type: "number", step: "any" };
  return { type: "text" };
}

const toText = (v) => (Array.isArray(v) ? v.join(", ") : v ?? "");

function parse(path, raw, current) {
  if (path === "contacts.businessPhones" || Array.isArray(current)) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (typeof current === "boolean") return raw === "true";
  if (inputFor(path, current).type === "number") return raw === "" ? "" : Number(raw);
  return raw;
}

export function Row({ path, label, value, flag, editable, draft, onDraft, error }) {
  const state = flagState(flag);
  const canEdit = editable && state === "open" && (typeof value !== "object" || value === null || Array.isArray(value));
  const id = `edit-${path.replace(/\./g, "-")}`;
  const current = draft !== undefined ? draft : value;
  return (
    <div className={styles.row} data-flag={state ?? undefined} id={flag ? `flag-${flag.id}` : undefined} tabIndex={flag ? -1 : undefined}>
      <dt>
        <label htmlFor={canEdit ? id : undefined}>{label}</label>
      </dt>
      <dd>
        {canEdit ? (
          typeof value === "boolean" ? (
            <select id={id} className={form.input} value={String(current)} onChange={(e) => onDraft(path, parse(path, e.target.value, value))} aria-invalid={error ? true : undefined}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : (
            <input
              id={id}
              className={form.input}
              value={toText(current)}
              onChange={(e) => onDraft(path, parse(path, e.target.value, value))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-err` : undefined}
              {...inputFor(path, value)}
            />
          )
        ) : (
          <span className={styles.value}>{show(value)}</span>
        )}
        <ErrorLine id={`${id}-err`} message={error} />
        <FlagNote flag={flag} state={state} />
      </dd>
    </div>
  );
}

export function DocRow({ slot, label, doc, flag, editable, pending, onPick, error }) {
  const input = useRef(null);
  const state = flagState(flag);
  const canEdit = editable && state === "open";
  const image = doc?.mime?.startsWith("image/") && doc.url;
  const choose = async (file) => {
    if (!file) return;
    const out = await prepareFile(file);
    onPick(slot, out.ok ? out.file : null, out.ok ? "" : out.message);
  };
  return (
    <li className={styles.docRow} data-flag={state ?? undefined} id={flag ? `flag-${flag.id}` : undefined} tabIndex={flag ? -1 : undefined}>
      <div className={styles.docMain}>
        {image ? (
          <img src={doc.url} alt="" className={styles.thumb} />
        ) : (
          <span className={styles.pdf}>
            <FontAwesomeIcon icon={faFilePdf} />
          </span>
        )}
        <div className={styles.docMeta}>
          <strong>{label}</strong>
          <span>{doc ? `${doc.name} (${sizeText(doc.size)})` : "Not uploaded"}</span>
          {pending && <span className={styles.pendingFile}>New file ready: {pending.name}</span>}
        </div>
        {doc?.url && (
          <a href={doc.url} target="_blank" rel="noopener noreferrer" className={styles.open} aria-label={`Open ${label}`}>
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
            <span>Open</span>
          </a>
        )}
        {canEdit && (
          <>
            <button type="button" className={styles.open} onClick={() => input.current.click()} aria-label={`Replace ${label}`}>
              <FontAwesomeIcon icon={faRotate} />
              <span>Replace</span>
            </button>
            <input ref={input} type="file" hidden aria-label={`Choose new file for ${label}`} accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
          </>
        )}
      </div>
      <ErrorLine message={error} />
      <FlagNote flag={flag} state={state} />
    </li>
  );
}
