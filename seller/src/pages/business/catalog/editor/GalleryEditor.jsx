import { GALLERY_RATIO, PAGE_LIMITS, SHARP_WIDTH } from "@epicmkt/shared";
import { Field } from "./parts.jsx";
import { AddPictures, CardTools, PictureFrame, moveIn } from "./SectionPictures.jsx";
import styles from "./sections.module.css";

const L = PAGE_LIMITS.gallery;

// "Images" (migration 0138): up to 5 pictures shown one under another above the videos on the item page, each with an optional title
// and caption under it.
// They are not the item photos at the top of the page and do not use any photo slot of the plan.
export default function GalleryEditor({ gallery, onChange, extras }) {
  const list = Array.isArray(gallery) ? gallery : [];
  const edit = (i, change) => onChange(list.map((g, n) => (n === i ? { ...g, ...change } : g)));
  return (
    <section className={styles.block} data-area="gallery" aria-labelledby="gallery-title">
      <div className={styles.head}>
        <h3 id="gallery-title" className={styles.title}>Images</h3>
        <span className={styles.count}>{list.length} of {L.rows}</span>
      </div>
      <p className={styles.hint}>
        Up to {L.rows} big pictures shown one under another on the item page, above the videos, like the description pictures on Amazon
        or Kilimall: features, how to use it, the item in a room, before and after. They are not your photos at the top and do not use a
        photo slot.
      </p>
      <div className={styles.example}>
        <span className={styles.exampleTag}>Best size</span>
        <span>At least <strong>1600 px wide</strong>, any shape. Each picture is shown whole across the page, never cropped or stretched, so a tall one takes more room. Pictures under {SHARP_WIDTH} px wide are marked because they look soft on big screens.</span>
      </div>
      {list.length > 0 && (
        <ol className={styles.cards}>
          {list.map((g, i) => {
            const name = g.label || `Image ${i + 1}`;
            return (
              <li key={g.mediaId ?? g.pending ?? i} className={styles.card}>
                <PictureFrame pic={extras.pic(g)} ratio={GALLERY_RATIO} alt={name} />
                <div className={styles.cardBody}>
                  <Field name={`gal-${i}-label`} label={`Image ${i + 1}: title (optional)`} area="gallery" max={L.label} value={g.label ?? ""}
                    placeholder="Cinematic movie mode" onChange={(e) => edit(i, { label: e.target.value })} />
                  <Field name={`gal-${i}-caption`} as="textarea" label="Caption (optional)" area="gallery" max={L.caption} value={g.caption ?? ""}
                    placeholder="Dialogue stays clear even at low volume." onChange={(e) => edit(i, { caption: e.target.value })} />
                  <CardTools index={i} count={list.length} name={name} onMove={(to) => onChange(moveIn(list, i, to))} onRemove={() => onChange(list.filter((_, n) => n !== i))} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <AddPictures extras={extras} left={L.rows - list.length} label={list.length ? "Add more images" : "Add images"}
        onAdded={(keys) => onChange([...list, ...keys.map((k) => ({ pending: k, label: "", caption: "" }))])} />
    </section>
  );
}
