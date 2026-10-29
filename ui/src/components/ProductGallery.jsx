import MediaGallery from "./MediaGallery.jsx";

const DEFAULT_LABELS = { zoom: "Zoom photo", photo: "Photo" };

// Kept for existing callers: pass `images` (and now optionally `videos`, or a ready `media` list) and get the one gallery.
export default function ProductGallery({ images = [], videos = [], media, name, labels = DEFAULT_LABELS, className }) {
  return <MediaGallery media={media} images={images} videos={videos} name={name} labels={labels} className={className} />;
}
