import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faCircleInfo, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { PAGE_LIMITS } from "@epicmkt/shared";
import { Field, RowList } from "./parts.jsx";
import styles from "./sections.module.css";
import editorStyles from "./editor.module.css";

const L = PAGE_LIMITS.notices;
export const TONES = [
  { id: "info", label: "Good to know", icon: faCircleInfo },
  { id: "caution", label: "Check before buying", icon: faTriangleExclamation },
  { id: "warning", label: "Warning", icon: faCircleExclamation }
];
const toneOf = (id) => TONES.find((t) => t.id === id) ?? TONES[0];

// Notes buyers must see (migration 0138): up to 3, shown in a box right under "About this item" on the item page.
export default function NoticesEditor({ notices, onChange, errors, focusOn }) {
  const rows = Array.isArray(notices) ? notices : [];
  return (
    <div className={editorStyles.subBlock} data-area="notices">
      <h3 className={editorStyles.subTitle}>Notes buyers must see (optional)</h3>
      <p className={editorStyles.hint}>
        Something a buyer should know before paying, shown in a box right under About this item. Use it for power and plugs, age limits,
        storage, installation or anything that could make the item wrong for them.
      </p>
      <div className={editorStyles.example}>
        <span className={editorStyles.exampleTag}>Example</span>
        <span>Title: <em>Product voltage: 240 V</em> · Text: <em>Works with Kenyan 240 V sockets. On 110 V supply, use a step-up converter.</em></span>
        <span>Others: <em>Keep refrigerated</em>, <em>Not for children under 3</em>, <em>Needs a qualified electrician to install</em>.</span>
      </div>
      <RowList
        noun={{ key: "nt", label: "Note", name: "note" }} rows={rows} max={L.rows} onChange={onChange} focusOn={focusOn}
        blank={{ tone: "info", title: "", text: "" }} focusFirst={(n) => `nt-${n}-title`} addLabel="Add a note" addKey="add-notice" icon={faCircleInfo}
        empty={{ title: "No notes", body: `Add up to ${L.rows}. Most items need none.` }}
        renderRow={(n, i, edit) => {
          const tone = toneOf(n.tone);
          return (
            <div className={styles.noteRow}>
              <fieldset className={styles.tones}>
                <legend className={styles.legend}>Type of note {i + 1}</legend>
                {TONES.map((t) => (
                  <label key={t.id} className={styles.tone} data-tone={t.id} data-on={n.tone === t.id || (!n.tone && t.id === "info") ? "" : undefined}>
                    <input type="radio" name={`nt-${i}-tone`} value={t.id} checked={(n.tone ?? "info") === t.id} onChange={() => edit((r) => ({ ...r, tone: t.id }))} />
                    <FontAwesomeIcon icon={t.icon} aria-hidden="true" /> {t.label}
                  </label>
                ))}
              </fieldset>
              <Field name={`nt-${i}-title`} label={`Note ${i + 1} title`} area="notices" max={L.title} value={n.title} error={errors?.[i]?.title}
                placeholder="Product voltage: 240 V" onChange={(e) => edit((r) => ({ ...r, title: e.target.value }))} />
              <Field name={`nt-${i}-text`} as="textarea" label={`Note ${i + 1} text`} area="notices" max={L.text} value={n.text} error={errors?.[i]?.text}
                placeholder="Works with Kenyan 240 V sockets. On 110 V supply, use a step-up converter." onChange={(e) => edit((r) => ({ ...r, text: e.target.value }))} />
              {(n.title || n.text) && (
                <div className={styles.notePreview} data-tone={tone.id} aria-label="How buyers see this note">
                  <FontAwesomeIcon icon={tone.icon} className={styles.noteIcon} aria-hidden="true" />
                  <div>
                    <strong>{n.title || "Title"}</strong>
                    <p>{n.text || "Text"}</p>
                  </div>
                </div>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
