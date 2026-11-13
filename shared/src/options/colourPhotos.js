const COLOUR = /colou?r|shade/i;

export const isColourAxis = (axis) => axis?.display === "swatch" || axis?.display === "image-card" || COLOUR.test(String(axis?.label ?? ""));

export const setValueMedia = (options, axisKey, valueId, mediaId) => ({
  ...options,
  axes: options.axes.map((a) => (a.key !== axisKey ? a : {
    ...a,
    values: a.values.map((v) => {
      if (v.id !== valueId) return v;
      const { mediaId: _old, ...rest } = v;
      return mediaId ? { ...rest, mediaId } : rest;
    }),
  })),
});

export const colourPhotoStatus = (options, photoIds = null) => {
  const known = Array.isArray(photoIds) ? new Set(photoIds) : null;
  const axis = (options?.axes ?? []).find(isColourAxis);
  if (!axis) return [];
  return axis.values.map((v) => ({ id: v.id, label: v.label, count: v.mediaId && (!known || known.has(v.mediaId)) ? 1 : 0 }));
};
