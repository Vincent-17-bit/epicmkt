import ProductMedia from "../components/ProductMedia.jsx";
import { itemT } from "./labels.js";

const galleryLabels = (t) => ({
  gallery: t("item.gallery"),
  choose: t("item.chooseMedia"),
  photo: t("item.photo"),
  video: t("item.video"),
  zoom: t("item.zoom"),
  play: t("video.playStage"),
  pause: t("video.pauseStage"),
  soundOn: t("video.soundOn"),
  soundOff: t("video.soundOff"),
  previous: t("item.prev"),
  next: t("item.next"),
  position: t("item.mediaPosition"),
  videoError: t("video.error"),
  slide: t("item.slide"),
  carousel: t("item.carousel")
});

// The Gallery slot: the item's photos and videos. ItemView keeps the wrapper that places it in the layout.
// Photos and videos in the marketplace layout (rail, "N+" tile, video tile, "Click to see full view" with VIDEOS / IMAGES tabs).
// `variantLabel` ("Colour: Black") is shown in the full view under the item's name.
export default function ItemGallery({ item, t = itemT, focus = null, variantLabel = "" }) {
  const labels = galleryLabels(t);
  return (
    <ProductMedia
      key={`gallery-${item.id}`}
      media={item.media}
      images={item.images}
      videos={item.videos}
      name={item.name}
      focus={focus}
      variantLabel={variantLabel}
      labels={{ previous: labels.previous, next: labels.next }}
    />
  );
}
