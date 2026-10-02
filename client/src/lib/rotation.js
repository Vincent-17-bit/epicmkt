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
