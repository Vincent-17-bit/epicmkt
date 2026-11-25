// After a new deploy, a tab (or an installed app) that was opened before it can ask for a file name that no longer exists. The browser then
// fires `vite:preloadError`. One reload fetches the new build; the guard stops a reload loop if the server really is down.
export function recoverFromStaleBuild(target = globalThis.window, storage) {
  if (!target?.addEventListener) return;
  const store = storage ?? (() => { try { return target.sessionStorage; } catch { return null; } })();
  target.addEventListener("vite:preloadError", (event) => {
    const now = Date.now();
    let last = 0;
    try { last = Number(store?.getItem("epicmkt:reloaded") ?? 0); } catch { /* storage blocked */ }
    if (now - last < 10000) return;
    try { store?.setItem("epicmkt:reloaded", String(now)); } catch { /* storage blocked */ }
    event.preventDefault?.();
    target.location.reload();
  });
}
