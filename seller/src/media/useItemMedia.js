import { useEffect, useMemo } from "react";
import { mediaCounterText } from "@epicmkt/shared";
import { useMediaStore, EMPTY_SLICE, visibleMedia, countsFor, configure, load } from "./mediaStore.js";

// One item's media. Reads only that item's slice, so another item's photos can never appear here.
export function useItemMedia(itemId, { limits = null, itemSaved = true } = {}) {
  const slice = useMediaStore((s) => s.byItem[itemId] ?? EMPTY_SLICE);

  useEffect(() => { configure(itemId, { limits, itemSaved }); }, [itemId, limits?.photos, limits?.videos, itemSaved]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (itemSaved) load(itemId); }, [itemId, itemSaved]);

  const media = useMemo(() => visibleMedia(slice), [slice.media, slice.removing]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => countsFor(slice), [slice.media, slice.removing, slice.jobs]); // eslint-disable-line react-hooks/exhaustive-deps
  const effective = slice.limits ?? limits;
  return {
    slice, media, jobs: slice.jobs, counts, limits: effective,
    counterText: effective ? mediaCounterText(counts, effective) : "",
    loading: slice.loading && !slice.loaded,
    error: slice.error,
  };
}
