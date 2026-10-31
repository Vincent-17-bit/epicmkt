import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "../../../../api/index.js";
import { mediaUrl } from "../../../../api/shape.js";
import { errorText } from "../../../../lib/errors.js";
import MediaManager from "../../../../components/mediaManager/MediaManager.jsx";
import useMediaManager from "../../../../components/mediaManager/useMediaManager.js";

const capOf = (limit) => (limit && limit.max != null ? Number(limit.max) : null);

export function useMediaSlot(item, { onPhotosChanged, seed = [] } = {}) {
  const found = useQuery({
    queryKey: ["media-limits", item?.id ?? null],
    queryFn: () => (item ? api.getItemMediaLimits(item.id) : api.getMediaLimits()),
    retry: false,
    staleTime: 0,
  });
  const limits = useMemo(() => (found.data ? { photos: capOf(found.data.photos), videos: capOf(found.data.videos) } : null), [found.data]);
  const manager = useMediaManager({ itemId: item?.id ?? null, limits, fallbackPaths: item?.imagePaths ?? [], seed });
  const { commit, failedFiles, tiles } = manager;

  const flush = useCallback(async (itemId) => {
    const { failed, orderError } = await commit(itemId);
    const problems = [];
    if (failed) problems.push(`${failed} ${failed === 1 ? "file" : "files"} did not upload.`);
    if (orderError) problems.push(`The order could not be saved. ${orderError}`);
    onPhotosChanged?.();
    return { problems, leftover: failedFiles() };
  }, [commit, failedFiles, onPhotosChanged]);

  const imageUrls = useMemo(() => tiles.filter((t) => t.kind === "image").map((t) => t.url ?? mediaUrl(t.path)).filter(Boolean), [tiles]);
  const preview = useMemo(
    () => tiles.map((t, n) => ({ id: t.key, kind: t.kind, url: t.url, poster: t.kind === "video" ? t.posterUrl ?? undefined : undefined, duration: t.durationSec ?? undefined, caption: `Item media ${n + 1}` })),
    [tiles],
  );
  const photoCount = tiles.filter((t) => t.kind === "image").length;
  const busy = manager.inFlight > 0 || manager.checking > 0 || tiles.some((t) => t.removing);

  return { item, manager, tiles, preview, imageUrls, photoCount, hasQueued: manager.dirty, busy, flush, errorText };
}

export default function MediaSlot({ media, disabled = false }) {
  return (
    <div data-slot="media">
      <MediaManager manager={media.manager} hasItem={Boolean(media.item)} disabled={disabled} />
    </div>
  );
}
