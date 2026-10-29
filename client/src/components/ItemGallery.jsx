import { MediaGallery } from "@epicmkt/ui";
import { t } from "../i18n/index.js";

// Photos and videos in one gallery, in the seller's order. `item` is the public item; media[] is used when the payload
// has it, otherwise images[] and videos[] are adapted (photos first).
export default function ItemGallery({ item }) {
  const labels = {
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
  };
  return <MediaGallery media={item.media} images={item.images} videos={item.videos} name={item.name} labels={labels} />;
}
