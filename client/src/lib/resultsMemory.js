import { RESULTS_KEY } from "../config/breadcrumbs.js";

const isListing = (pathname) => pathname.startsWith("/c/") || pathname === "/search";

export function rememberResults(pathname, search) {
  try {
    if (isListing(pathname)) sessionStorage.setItem(RESULTS_KEY, JSON.stringify({ path: pathname, search }));
    else sessionStorage.removeItem(RESULTS_KEY);
  } catch {
    return;
  }
}

export function readResults() {
  try {
    const raw = sessionStorage.getItem(RESULTS_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && isListing(value.path) ? value : null;
  } catch {
    return null;
  }
}
