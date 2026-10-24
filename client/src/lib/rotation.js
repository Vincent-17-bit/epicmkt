let seed;

export function rotationSeed() {
  if (seed !== undefined) return seed;
  try {
    const stored = sessionStorage.getItem("epicmkt-rotation");
    if (stored) {
      seed = Number(stored);
      return seed;
    }
  } catch {}
  seed = Math.floor(Math.random() * 2 ** 31);
  try {
    sessionStorage.setItem("epicmkt-rotation", String(seed));
  } catch {}
  return seed;
}

// Like rotationSeed, but it changes every few minutes, so a long-open tab or a quick return visit gets a fresh
// shuffle while everything within one stretch of browsing stays stable (and cacheable).
export function rotationWindowSeed(minutes = 15, now = Date.now()) {
  return (rotationSeed() ^ Math.floor(now / (minutes * 60_000))) >>> 0;
}
