import { useMemo } from "react";
import { ProductGallery } from "@epicmkt/ui";
import { canPublish, coverOf, customerMedia, galleryItems, PUBLISH_BLOCKED_MESSAGE } from "@epicmkt/shared";
import { Button, Modal } from "../ui/ui.jsx";
import styles from "./media.module.css";

// The real shopper gallery, fed exactly what shoppers get: ready media only, in their order, never autoplaying.
export function PreviewDialog({ open, onClose, media, itemName }) {
  const items = useMemo(() => galleryItems(media, itemName), [media, itemName]);
  const cover = useMemo(() => coverOf(media), [media]);
  const hidden = media.length - customerMedia(media).length;
  return (
    <Modal open={open} onClose={onClose} title={`Preview: ${itemName || "your item"}`} actions={<Button onClick={onClose}>Close preview</Button>}>
      <div className={styles.previewWrap} data-testid="gallery-preview">
        {items.length ? <ProductGallery images={items} name={itemName || "Item"} /> : <p className={styles.muted}>Nothing to show yet. Add a photo first.</p>}
        {cover && (
          <figure className={styles.previewCard}>
            <img src={cover.thumbUrl} alt="" className={styles.thumbImg} data-testid="preview-cover" />
            <figcaption className={styles.muted}>This photo is the cover on item cards.</figcaption>
          </figure>
        )}
        {!canPublish(media) && <p className={styles.warning} role="note">{PUBLISH_BLOCKED_MESSAGE}</p>}
        {hidden > 0 && <p className={styles.muted}>{hidden === 1 ? "1 file is" : `${hidden} files are`} not shown to shoppers (still processing, failed, or removed by admin).</p>}
      </div>
    </Modal>
  );
}
