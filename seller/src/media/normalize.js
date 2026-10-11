// Turns a database row (or the mock's equivalent) into what the UI uses. One shape for both implementations.
export function normalizeRow(row, urlFor) {
  const variants = row.variants ?? {};
  const widths = Object.keys(variants).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const srcSet = widths.filter((w) => w <= 1600).map((w) => `${urlFor(variants[w])} ${w}w`).join(", ");
  return {
    id: row.id,
    itemId: row.item_id,
    kind: row.kind,
    status: row.status ?? "ready",
    failReason: row.fail_reason ?? null,
    sort: row.sort ?? 0,
    mime: row.mime,
    url: urlFor(row.path),
    thumbUrl: variants[320] ? urlFor(variants[320]) : urlFor(row.path),
    srcSet: srcSet || null,
    zoomUrl: variants[2000] ? urlFor(variants[2000]) : null,
    posterUrl: row.poster_path ? urlFor(row.poster_path) : null,
    placeholder: row.placeholder ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    durationSec: row.duration_sec == null ? null : Number(row.duration_sec),
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    alt: row.alt ?? "",
    variantId: row.variant_id ?? null,
    removedByAdmin: Boolean(row.removed_by_admin),
    adminRemoveReason: row.admin_remove_reason ?? null,
    createdAt: row.created_at ?? null,
  };
}
