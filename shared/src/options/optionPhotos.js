// A photo for any option value, not only colours: "Super loaf", "400g", "Large", "Walnut" can each carry the item photo that shows it.
// Pure code, no browser or Node APIs. The stored link is `value.mediaId` (one of the item's own photos, checked by the database); this
// file adds what the screens need around it:
//   axisHasPhotos / valuePhotoCount   does this option type use photos at all, how many of its values have one
//   setValuePhoto / clearValuePhoto   the seller's edit: a saved photo (mediaId) or a photo still being sent (a `photoTile` marker)
//   pendingPhotoTiles / attachPhotos  a photo picked while the item is new has no id until it is saved: link it by its tile key afterwards
//   focusMediaId                      which photo the item gallery should show for what the buyer has chosen
//   photosByLabel                     size name -> photo, so the size guide can show a picture beside each size
// `photoTile` lives only in the editor's form. buildPayload in editor.js copies id, label, color and mediaId, so it never reaches the server.

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export const valueHasPhoto = (value) => Boolean(value?.mediaId || value?.photoTile);
export const axisHasPhotos = (axis) => (axis?.values ?? []).some((v) => Boolean(v?.mediaId));
export const valuePhotoCount = (axis) => (axis?.values ?? []).filter(valueHasPhoto).length;

const mapValue = (options, axisKey, valueId, fn) => ({
  ...options,
  axes: options.axes.map((a) => (a.key !== axisKey ? a : { ...a, values: a.values.map((v) => (v.id === valueId ? fn(v) : v)) }))
});

/** Gives a value a photo: `mediaId` for a photo the item already has, or `tile` (the upload's key) for one still on its way. */
export const setValuePhoto = (options, axisKey, valueId, { mediaId = null, tile = null } = {}) =>
  mapValue(options, axisKey, valueId, (v) => {
    const { mediaId: _m, photoTile: _t, ...rest } = v;
    return { ...rest, ...(mediaId ? { mediaId } : {}), ...(!mediaId && tile ? { photoTile: tile } : {}) };
  });

export const clearValuePhoto = (options, axisKey, valueId) => setValuePhoto(options, axisKey, valueId, {});

/** Tile keys of photos chosen for values but not yet saved with the item. */
export const pendingPhotoTiles = (options) => (options?.axes ?? []).flatMap((a) => a.values.filter((v) => v.photoTile && !v.mediaId).map((v) => v.photoTile));

/**
 * After the photos are saved: turns each pending marker into the real photo id. `resolve(tileKey)` returns the id, or null when the
 * upload failed or was removed (that value simply has no photo). Returns { options, linked, missing }.
 */
export function attachPhotos(options, resolve) {
  let linked = 0;
  let missing = 0;
  const axes = options.axes.map((a) => ({
    ...a,
    values: a.values.map((v) => {
      if (!v.photoTile) return v;
      const { photoTile, ...rest } = v;
      const id = resolve(photoTile);
      if (id) { linked += 1; return { ...rest, mediaId: id }; }
      missing += 1;
      return rest;
    })
  }));
  return { options: { ...options, axes }, linked, missing };
}

/**
 * The photo the gallery should show. The value the buyer just picked wins, then the exact combination's own photos, then the other
 * choices from the last option type to the first (the size is usually the most specific). null when nothing has a photo.
 */
export function focusMediaId({ axes, variant, choice, lastAxisKey = null } = {}) {
  const list = Array.isArray(axes) ? axes : [];
  const photoOf = (axis) => axis?.values?.find((v) => v.id === choice?.[axis.key])?.mediaId ?? null;
  const last = list.find((a) => a.key === lastAxisKey);
  const first = photoOf(last);
  if (first) return first;
  const own = Array.isArray(variant?.mediaIds) ? variant.mediaIds.find(Boolean) : null;
  if (own) return own;
  for (const axis of [...list].reverse()) {
    const id = photoOf(axis);
    if (id) return id;
  }
  return null;
}

/** Size name (lower case, spaces collapsed) -> { id, url } for every option value that has a photo. `media` is the item's photos: [{ id, url }]. */
export function photosByLabel(axes, media) {
  const byId = new Map((Array.isArray(media) ? media : []).filter((m) => m?.id && m?.url).map((m) => [m.id, m.url]));
  const out = new Map();
  for (const axis of Array.isArray(axes) ? axes : []) {
    for (const v of axis.values ?? []) {
      const url = v.mediaId ? byId.get(v.mediaId) : null;
      const key = norm(v.label);
      if (url && key && !out.has(key)) out.set(key, { id: v.mediaId, url });
    }
  }
  return out;
}

export const labelKey = norm;

// ---- Size guide rows <-> option values ----
// A guide row ("Standard | 400g | 16 slices") stands for an option value when any of its cells names it: the size is sometimes the row's
// name ("Large") and sometimes a column ("400g"). The row's own name is tried first.

/** The option value a guide row stands for: { axisKey, valueId, label } or null. */
export function valueForRow(axes, row) {
  const cells = (Array.isArray(row) ? row : []).map(norm).filter(Boolean);
  for (const cell of cells) {
    for (const axis of Array.isArray(axes) ? axes : []) {
      const v = (axis.values ?? []).find((x) => norm(x.label) === cell);
      if (v) return { axisKey: axis.key, valueId: v.id, label: v.label };
    }
  }
  return null;
}

/** The index of the guide row that stands for a chosen label (any cell may carry it), or -1. */
export function rowForLabel(rows, label) {
  const want = norm(label).replace(/^(eu|uk|us)\s+/, "");
  if (!want) return -1;
  const clean = (c) => norm(c).replace(/^(eu|uk|us)\s+/, "");
  const first = (rows ?? []).findIndex((r) => clean(r?.[0]) === want);
  return first >= 0 ? first : (rows ?? []).findIndex((r) => (Array.isArray(r) ? r : []).some((c) => clean(c) === want));
}

/** The photo { id, url } for a guide row, from photosByLabel(): the row's own name first, then its other cells. null when none. */
export function photoForRow(photos, row) {
  if (!(photos instanceof Map)) return null;
  for (const cell of Array.isArray(row) ? row : []) {
    const hit = photos.get(norm(cell));
    if (hit) return hit;
  }
  return null;
}
