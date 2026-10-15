// Dependency-free check, safe to import from the main bundle.
const AUTH_KEY = /^sb-.+-auth-token$/;

// True when a Supabase session is stored in this browser. Cheap and synchronous, so it gates the lazy chunk.
export function hasStoredSession(storage = typeof localStorage === "undefined" ? null : localStorage) {
  try {
    for (let i = 0; i < (storage?.length ?? 0); i += 1) if (AUTH_KEY.test(storage.key(i) ?? "")) return true;
  } catch {
    /* storage blocked */
  }
  return false;
}
