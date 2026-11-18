import { faImage } from "@fortawesome/free-solid-svg-icons";
import { BRAND_CARD_RATIO, BRAND_LIMITS, BRAND_PHOTO_MAX, PAGE_LIMITS, SPEC_LIMITS, brandRows, brandSpecs, isBrandGroup, isBrandImageGroup } from "@epicmkt/shared";
import { Field, RowList } from "./parts.jsx";
import { AddPictures, CardTools, PictureFrame, moveIn } from "./SectionPictures.jsx";
import styles from "./editor.module.css";
import pics from "./sections.module.css";

const CARDS = PAGE_LIMITS.brand;

// "From the brand" (migration 0138): what the brand has achieved, shown as a row of cards buyers swipe through, over a wide banner picture.
// Awards, certificates and figures ("9K+ bought last month", "18 months warranty") work best. The short story blocks below stay optional.
export default function BrandEditor({ specs, onChange, focusOn, usedElsewhere, brand, onBrand, extras }) {
  const rows = brandRows(specs);
  const rest = specs.filter((s) => !isBrandGroup(s.group) && !isBrandImageGroup(s.group));
  const max = Math.min(BRAND_LIMITS.rows, SPEC_LIMITS.rows - usedElsewhere);
  const write = (next) => onChange([...rest, ...brandSpecs(next)]);
  const b = brand ?? { banner: null, cards: [] };
  const cards = b.cards ?? [];
  const setCards = (next) => onBrand({ ...b, cards: next });
  return (
    <div className={styles.subBlock} data-area="brandstory">
      <h3 className={styles.subTitle}>From the brand</h3>
      <p className={styles.hint}>Show what the brand has achieved: awards, certificates and numbers buyers trust. Buyers swipe through the cards on the item page.</p>
      {extras && onBrand && (
        <>
          <div className={pics.brandBanner}>
            <div className={pics.head}>
              <h4 className={pics.titleSm}>Banner picture (optional)</h4>
            </div>
            <p className={pics.hint}>A wide picture of the product or the brand, at least 1600 px wide. The cards sit on top of it.</p>
            {b.banner ? (
              <div className={pics.bannerRow}>
                <PictureFrame pic={extras.pic(b.banner)} ratio="21 / 9" alt="Brand banner" />
                <button type="button" className={pics.toolDanger} onClick={() => onBrand({ ...b, banner: null })} aria-label="Remove the banner picture" title="Remove">Remove</button>
              </div>
            ) : (
              <AddPictures extras={extras} left={1} multiple={false} label="Add a banner picture" onAdded={([k]) => onBrand({ ...b, banner: { pending: k } })} />
            )}
          </div>
          <div className={pics.block} data-area="brandcards">
            <div className={pics.head}>
              <h4 className={pics.titleSm}>Achievement cards</h4>
              <span className={pics.count}>{cards.length} of {CARDS.cards}</span>
            </div>
            <p className={pics.hint}>Tall pictures (4:5, like 800 × 1000 px) fit best, such as an award certificate or a card that says "9K+ bought in the past month". A caption under each is optional.</p>
            {cards.length > 0 && (
              <ol className={pics.cardsTall}>
                {cards.map((c, i) => {
                  const name = c.caption || `Card ${i + 1}`;
                  return (
                    <li key={c.mediaId ?? c.pending ?? i} className={pics.card}>
                      <PictureFrame pic={extras.pic(c)} ratio={BRAND_CARD_RATIO} alt={name} />
                      <div className={pics.cardBody}>
                        <Field name={`brandcard-${i}`} label={`Card ${i + 1} caption (optional)`} area="brandcards" max={CARDS.caption} value={c.caption ?? ""}
                          placeholder="Reddot winner 2026" onChange={(e) => setCards(cards.map((x, n) => (n === i ? { ...x, caption: e.target.value } : x)))} />
                        <CardTools index={i} count={cards.length} name={name} onMove={(to) => setCards(moveIn(cards, i, to))} onRemove={() => setCards(cards.filter((_, n) => n !== i))} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <AddPictures extras={extras} left={CARDS.cards - cards.length} label={cards.length ? "Add more cards" : "Add achievement cards"}
              onAdded={(keys) => setCards([...cards, ...keys.map((k) => ({ pending: k, caption: "" }))])} />
          </div>
        </>
      )}
      <h4 className={pics.titleSm}>Brand story (optional)</h4>
      <p className={styles.hint}>Short text blocks shown under the cards, each beside a photo. Leave the photo on Automatic to use your product photos in turn, or pick the photo number from Photos and videos.</p>
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
