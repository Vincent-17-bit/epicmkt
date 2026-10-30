import { MediaGallery } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import MediaVideo from "./MediaVideo.jsx";

export default function ItemGallery({ images, videos, media, name }) {
  const list = media?.length ? media : [...(images ?? []).map((image) => ({ ...image, kind: "image" })), ...(videos ?? []).map((video) => ({ ...video, kind: "video" }))];
  return (
    <MediaGallery
      media={list}
      name={name}
      labels={{ zoom: t("item.zoom"), photo: t("item.photo"), video: t("item.video") }}
      renderVideo={(video) => <MediaVideo src={video.url} label={name} durationSec={video.durationSec} fill />}
    />
  );
}
