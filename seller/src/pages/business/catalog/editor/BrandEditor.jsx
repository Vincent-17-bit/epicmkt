import { faImage } from "@fortawesome/free-solid-svg-icons";
import { BRAND_GROUP, BRAND_LIMITS, SPEC_LIMITS, brandRows, isBrandGroup } from "@epicmkt/shared";
import { Field, RowList } from "./parts.jsx";
import styles from "./editor.module.css";

export default function BrandEditor({ specs, onChange, focusOn, usedElsewhere }) {
  const rows = brandRows(specs);
  const rest = specs.filter((s) => !isBrandGroup(s.group));
  const max = Math.min(BRAND_LIMITS.rows, SPEC_LIMITS.rows - usedElsewhere);
  const write = (next) => onChange([...rest, ...next.map((r) => ({ group: BRAND_GROUP, label: r.heading, value: r.text }))]);
  return (
    <div className={styles.subBlock} data-area="brandstory">
      <h3 className={styles.subTitle}>From the brand</h3>
      <p className={styles.hint}>Short story blocks shown under the item with its photos, in order: block 1 beside photo 2, block 2 beside photo 3, and so on.</p>
      <RowList
        noun={{ key: "brand", label: "Block", name: "block" }} rows={rows} max={max} onChange={write} focusOn={focusOn}
        blank={{ heading: "", text: "" }} focusFirst={(n) => `brand-${n}-heading`} addLabel="Add block" addKey="add-brand" icon={faImage}
        empty={{ title: "No blocks yet", body: "Add up to 6, like \"Made for everyday use\" or \"Built to last\"." }}
        renderRow={(r, i, edit) => (
          <>
            <Field name={`brand-${i}-heading`} label="Heading" area="brandstory" max={BRAND_LIMITS.heading} value={r.heading} onChange={(e) => edit((x) => ({ ...x, heading: e.target.value }))} />
            <Field name={`brand-${i}-text`} as="textarea" label="Text" area="brandstory" max={BRAND_LIMITS.text} value={r.text} onChange={(e) => edit((x) => ({ ...x, text: e.target.value }))} />
          </>
        )}
      />
    </div>
  );
}
