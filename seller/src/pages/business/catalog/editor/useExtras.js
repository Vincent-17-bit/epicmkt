import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MEDIA3D, SHARP_WIDTH, checkTicketRequest } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import { mediaUrl } from "../../../../api/shape.js";
import { errorText } from "../../../../lib/errors.js";

// The pictures of the page sections (What's included, Images, From the brand): their own kind of upload, so they never take a photo slot
// and never show among the photos at the top of the page (migration 0138).
//   saved      Map id -> { id, path, url, width, height }    (the item's stored extra pictures)
//   add(file)  checks the file, measures it, keeps it on this device until Save -> { key } or { error }
//   pic(ref)   the picture a form reference points at: { url, width, height, small } or null
//   flush(id, keys)  uploads the waiting pictures the form still uses -> { ids: { key: mediaId }, problems: [text] }
const measure = async (file) => {
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(file);
      const size = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return size;
    }
  } catch { /* some browsers cannot decode every format here; the size is only used for a hint */ }
  return { width: null, height: null };
};

export const extrasKey = (itemId) => ["item-extras", itemId ?? "new"];

export function useExtras(item) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: extrasKey(item?.id),
    queryFn: () => api.listItemExtras(item.id),
    enabled: Boolean(item?.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1
  });
  const waiting = useRef(new Map());
  const [version, setVersion] = useState(0);
  const seq = useRef(0);

  // Object urls of pictures that were never saved are let go when the editor closes.
  useEffect(() => () => { for (const p of waiting.current.values()) try { URL.revokeObjectURL(p.url); } catch { /* not an object url */ } }, []);

  const saved = useMemo(
    () => new Map((query.data ?? []).map((x) => [x.id, { ...x, url: x.url ?? mediaUrl(x.path), small: Number.isFinite(x.width) && x.width > 0 && x.width < SHARP_WIDTH }])),
    [query.data]
  );

  const add = useCallback(async (file) => {
    const type = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file?.type];
    const checked = checkTicketRequest({ kind: "extra-image", type: type ?? file?.type, size: file?.size });
    if (!checked.ok) {
      return { error: checked.error === "too_large" ? `That picture is over ${Math.round(MEDIA3D.imageMaxBytes / 1048576)} MB. Choose a smaller one.` : "Use a JPG, PNG or WebP picture." };
    }
    const { width, height } = await measure(file);
    let url = "";
    try { url = URL.createObjectURL(file); } catch { url = ""; }
    seq.current += 1;
    const key = `extra-${Date.now().toString(36)}-${seq.current}`;
    waiting.current.set(key, { file, url, width, height, small: Number.isFinite(width) && width > 0 && width < SHARP_WIDTH });
    setVersion((v) => v + 1);
    return { key };
  }, []);

  const pic = useCallback((ref) => {
    if (!ref) return null;
    if (ref.mediaId) return saved.get(ref.mediaId) ?? null;
    if (ref.pending) return waiting.current.get(ref.pending) ?? null;
    return null;
  }, [saved, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async (itemId, keys) => {
    const ids = {};
    const problems = [];
    let failed = 0;
    for (const key of [...new Set(keys)]) {
      const w = waiting.current.get(key);
      if (!w) continue;   // a draft restored on another visit: the file is gone, so the line simply has no picture
      try {
        const r = await api.uploadItemExtra(itemId, w.file);
        if (r?.id) ids[key] = r.id;
        else failed += 1;
      } catch (err) {
        failed += 1;
        if (!problems.length) problems.push(`${errorText(err)}`);
      }
    }
    if (failed) problems.unshift(`${failed} ${failed === 1 ? "picture" : "pictures"} for What's included, Images or From the brand did not upload.`);
    if (Object.keys(ids).length) await qc.invalidateQueries({ queryKey: extrasKey(itemId) });
    return { ids, problems };
  }, [qc]);

  /** After a save the form points at saved ids, so the waiting copies of those pictures can go. */
  const settle = useCallback((ids) => {
    for (const key of Object.keys(ids ?? {})) {
      const w = waiting.current.get(key);
      if (w) {
        // Keep the object url alive until the saved list has the picture, so the thumbnail does not blink.
        setTimeout(() => { try { URL.revokeObjectURL(w.url); } catch { /* ignore */ } }, 5000);
        waiting.current.delete(key);
      }
    }
    setVersion((v) => v + 1);
  }, []);

  return { saved, add, pic, flush, settle, loading: query.isLoading, version };
}
