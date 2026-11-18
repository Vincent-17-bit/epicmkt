import { faImage } from "@fortawesome/free-solid-svg-icons";
import { BRAND_LIMITS, BRAND_PHOTO_MAX, SPEC_LIMITS, brandRows, brandSpecs, isBrandGroup, isBrandImageGroup } from "@epicmkt/shared";
import { Field, RowList } from "./parts.jsx";
import styles from "./editor.module.css";

export default function BrandEditor({ specs, onChange, focusOn, usedElsewhere }) {
  const rows = brandRows(specs);
  const rest = specs.filter((s) => !isBrandGroup(s.group) && !isBrandImageGroup(s.group));
  const max = Math.min(BRAND_LIMITS.rows, SPEC_LIMITS.rows - usedElsewhere);
  const write = (next) => onChange([...rest, ...brandSpecs(next)]);
  return (
    <div className={styles.subBlock} data-area="brandstory">
      <h3 className={styles.subTitle}>From the brand</h3>
      <p className={styles.hint}>Short story blocks shown under the item, each beside a photo. Leave the photo on Automatic to use your product photos in turn, or pick the photo number from Photos and videos.</p>
      <RowList
        noun={{ key: "brand", label: "Block", name: "block" }} rows={rows} max={max} onChange={write} focusOn={focusOn}
        blank={{ heading: "", text: "", photo: "" }} focusFirst={(n) => `brand-${n}-heading`} addLabel="Add block" addKey="add-brand" icon={faImage}
        empty={{ title: "No blocks yet", body: "Add up to 6, like \"Made for everyday use\" or \"Built to last\"." }}
        renderRow={(r, i, edit) => (
          <>
            <Field name={`brand-${i}-heading`} label="Heading" area="brandstory" max={BRAND_LIMITS.heading} value={r.heading} onChange={(e) => edit((x) => ({ ...x, heading: e.target.value }))} />
            <Field name={`brand-${i}-photo`} as="select" label="Photo" area="brandstory" value={r.photo} onChange={(e) => edit((x) => ({ ...x, photo: e.target.value }))}>
              <option value="">Automatic</option>
              {Array.from({ length: BRAND_PHOTO_MAX }, (_, n) => <option key={n + 1} value={String(n + 1)}>Photo {n + 1}</option>)}
            </Field>
            <Field name={`brand-${i}-text`} as="textarea" label="Text" area="brandstory" max={BRAND_LIMITS.text} value={r.text} onChange={(e) => edit((x) => ({ ...x, text: e.target.value }))} />
          </>
        )}
      />
    </div>
  );
}
