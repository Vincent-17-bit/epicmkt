import { MediaGallery } from "@epicmkt/ui";
import { formatKes } from "@epicmkt/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay } from "@fortawesome/free-solid-svg-icons";
import page from "./itemEditor.module.css";

const kes = (v) => (String(v ?? "").trim() !== "" && Number.isFinite(Number(v)) ? formatKes(Number(v)) : "");

const priceText = (f) => {
  if (f.priceType === "free") return "Free";
  if (f.priceType === "contact") return "Contact for price";
  const low = kes(f.price);
  if (!low) return "";
  if (f.priceType === "from") return `From ${low}`;
  if (f.priceType === "range") return kes(f.priceMax) ? `${low} - ${kes(f.priceMax)}` : low;
  return low;
};

function PreviewVideo({ item }) {
  return (
    <span className={page.pvVideo} role="img" aria-label="Video">
      {item.posterUrl && <img src={item.posterUrl} alt="" className={page.pvPoster} />}
      <span className={page.pvPlay}><FontAwesomeIcon icon={faPlay} aria-hidden="true" /></span>
    </span>
  );
}

export default function ItemPreview({ form, tiles }) {
  const media = tiles
    .filter((t) => t.status !== "error")
    .map((t) => ({ id: t.key, kind: t.kind, url: t.url, durationSec: t.durationSec, posterUrl: t.posterUrl, caption: form.name }));
  const price = priceText(form);
  return (
    <div className={page.pv} data-testid="item-preview">
      <h2 className={page.pvHeading}>Preview</h2>
      <p className={page.pvNote}>This is how customers see the item.</p>
      <div className={page.pvCard}>
        {media.length > 0 ? (
          <MediaGallery media={media} name={form.name || "Item"} labels={{ zoom: "Zoom photo", photo: "Photo", video: "Video" }} renderVideo={(item) => <PreviewVideo item={item} />} />
        ) : (
          <div className={page.pvEmpty}>No photos yet</div>
        )}
        <div className={page.pvInfo}>
          <h3 className={page.pvName}>{form.name || "Item name"}</h3>
          {form.brand && <p className={page.pvBrand}>{form.brand}</p>}
          {price && <p className={page.pvPrice}>{price}{form.unit ? ` / ${form.unit}` : ""}</p>}
          {form.shortDescription && <p className={page.pvShort} data-testid="preview-short">{form.shortDescription}</p>}
        </div>
        {form.description && (
          <section className={page.pvPanel} aria-label="Description">
            <h3 className={page.pvPanelTitle}>Description</h3>
            <p className={page.pvText} data-testid="preview-description">{form.description}</p>
          </section>
        )}
      </div>
    </div>
  );
}
