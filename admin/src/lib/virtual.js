// The arithmetic behind the virtualised rows: which rows to draw for a scroll position, and how much empty space to
// leave above and below so the scrollbar still matches the full list. No DOM, so it is easy to test.

/** offsets[i] is where row i starts; offsets[count] is the full height. `sizeOf(i)` is the height of row i. */
export function buildOffsets(count, sizeOf) {
  const offsets = new Float64Array(count + 1);
  for (let i = 0; i < count; i += 1) offsets[i + 1] = offsets[i] + Math.max(0, sizeOf(i));
  return offsets;
}

/** The index of the row that contains `y` (clamped to the first and last row). Binary search. */
export function rowAt(offsets, y) {
  const count = offsets.length - 1;
  if (count <= 0) return 0;
  let lo = 0, hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * The rows to draw. `overscan` extra rows on each side stop blank flashes while scrolling fast.
 * Returns { start, end, padTop, padBottom, total } where end is exclusive.
 */
export function visibleRange(offsets, scrollTop, viewportHeight, overscan = 6) {
  const count = offsets.length - 1;
  const total = offsets[count] ?? 0;
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0, total: 0 };
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, total - viewportHeight)));
  const first = rowAt(offsets, top);
  const last = rowAt(offsets, top + Math.max(0, viewportHeight - 1));
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, last + 1 + overscan);
  return { start, end, padTop: offsets[start], padBottom: Math.max(0, total - offsets[end]), total };
}
