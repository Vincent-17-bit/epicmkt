import { RESULTS_KEY } from "../config/breadcrumbs.js";

const INSENSITIVE_LISTINGS = ["/flash", "/offers"];

const positions = new Map();

export const keepsScroll = (pathname) => INSENSITIVE_LISTINGS.includes(pathname.replace(/\/+$/, "").toLowerCase());

export function saveScroll(key, pathname, top) {
  if (keepsScroll(pathname)) positions.set(key, top);
}

export const savedScroll = (key) => positions.get(key);

export const isListing = (pathname) =>
  pathname.startsWith("/c/") || pathname === "/search" || INSENSITIVE_LISTINGS.includes(pathname.replace(/\/+$/, "").toLowerCase());

const slugOf = (pathname) => /^\/b\/([^/]+)/.exec(pathname)?.[1] ?? null;
const indexOf = (idx) => (Number.isInteger(idx) ? idx : null);

let listing = null;
let previous = null;

export function readResults() {
  try {
    const raw = sessionStorage.getItem(RESULTS_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && isListing(value.path) && value.businessSlug ? value : null;
  } catch {
    return null;
  }
}

export function clearResults() {
  try {
    sessionStorage.removeItem(RESULTS_KEY);
  } catch {
    return;
  }
}

function writeResults(value) {
  try {
    sessionStorage.setItem(RESULTS_KEY, JSON.stringify(value));
  } catch {
    return;
  }
}

export function trackResults(location, idx = window.history.state?.idx) {
  if (previous?.key === location.key) return;
  const from = previous;
  previous = { key: location.key, pathname: location.pathname };

  if (isListing(location.pathname)) {
    listing = { path: location.pathname, search: location.search, historyIdx: indexOf(idx) };
    return;
  }

  const slug = slugOf(location.pathname);
  if (!slug) return;

  if (from && isListing(from.pathname) && listing) {
    writeResults({ ...listing, businessSlug: slug });
  } else if (from ? slugOf(from.pathname) !== slug : readResults()?.businessSlug !== slug) {
    clearResults();
  }
}

export const backDelta = (stored, idx = window.history.state?.idx) => {
  const current = indexOf(idx);
  return stored.historyIdx != null && current != null ? current - stored.historyIdx : 0;
};
