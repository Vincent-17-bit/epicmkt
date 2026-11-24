// index.html starts the flash-sales request the moment the page is parsed (earlyFlashFetch in vite.config.js) and leaves the pending
// answer on window.__epicFlash. Without it the request could only start after the app (a few hundred KB) had downloaded, parsed and
// run, and the first picture on the page waited behind all of that.
//
// The answer is used once, and only while it is fresh. Anything missing, late or failed returns null, and the app asks Supabase itself
// exactly as it always did, so this can only make the first load faster, never wrong.
const FRESH_MS = 15_000;

export async function takeEarlyFlashRows() {
  const early = typeof window === "undefined" ? null : window.__epicFlash;
  if (!early) return null;
  window.__epicFlash = null;
  if (Date.now() - early.sent > FRESH_MS) return null;
  try {
    const result = await early.promise;
    return result && Array.isArray(result.rows) && Date.now() - result.receivedAt <= FRESH_MS ? result : null;
  } catch {
    return null;
  }
}
