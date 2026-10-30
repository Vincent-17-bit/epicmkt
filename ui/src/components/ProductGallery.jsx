import MediaGallery from "./MediaGallery.jsx";

const DEFAULT_LABELS = { zoom: "Zoom photo", photo: "Photo" };

export default function ProductGallery({ images, name, labels = DEFAULT_LABELS }) {
  return <MediaGallery media={images.map((image) => ({ ...image, kind: "image" }))} name={name} labels={labels} />;
}
