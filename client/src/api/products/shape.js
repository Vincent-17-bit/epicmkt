import { mediaUrl } from "../flash/shape.js";

// /api/products sends raw storage paths for pictures (media-host sharding stays in the browser). Every answer from it goes
// through this before a card sees it: the grid pages and the /products search results alike. Without it a card is handed a
// bare path, the browser asks for an address that does not exist, and only the EpicMKT placeholder shows.
// A product that already has full urls (the fallback list, demo data) is left alone.
export function shapeProduct(p) {
  if (!p || p.images || p.imageUrl === undefined) return p;
  const url = p.imagePath ? mediaUrl(p.imagePath) : null;
  const images = url ? [{ id: "i1", url, caption: p.name }] : [];
  // A card carries its cover and the item's videos (the full photo sequence comes with the item's own page). The cover stays first
  // here: a video is never the cover.
  const videos = (p.videoPaths ?? []).map((path, index) => ({ id: `v${index + 1}`, url: mediaUrl(path), caption: p.name }));
  const media = [...images.map((m) => ({ ...m, kind: "image" })), ...videos.map((m) => ({ ...m, kind: "video" }))];
  return { ...p, description: p.description ?? p.shortDescription ?? "", imageUrl: url, images, videos, media };
}
