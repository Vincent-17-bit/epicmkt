// Mock admin API. Same exports and signatures as live.js. Data lives in localStorage (an in-memory
// fallback is used when storage is blocked), is seeded on first use, and every call waits a short,
// random time to feel like a network.

import { ApiError } from "./errors.js";
import { normalizeListParams, MIN_SEARCH_LENGTH, cleanTerm, pick } from "./query.js";
import { resourceDef, RESOURCE_NAMES } from "./resources.js";
import {
  CONFIRMING_STATUS,
  EXPIRING_DAYS,
  WAITING_APPLICATION_STATUSES,
  groupSearch,
  makeLegacy,
  toSearchResult,
  withBrief,
} from "./shape.js";
import { SEED_VERSION, buildSeed } from "./seed.js";

const DATA_KEY = "epicmkt.admin.mock.data";
const SESSION_KEY = "epicmkt.admin.mock.session";
const SESSION_MS = 8 * 60 * 60 * 1000;
const SEARCH_LIMIT = 5;

export const DEMO_ACCOUNTS = [
  { id: "00000000-0000-4000-8000-0000000000a1", email: "owner@epicmkt.test", password: "Demo-Passw0rd", displayName: "Demo Owner", role: "owner" },
  { id: "00000000-0000-4000-8000-0000000000a2", email: "support@epicmkt.test", password: "Demo-Passw0rd", displayName: "Demo Support", role: "support" },
];

const config = { latency: [120, 280], storage: null, now: () => Date.now() };

// Test and demo hook. `latency` is [min, max] in ms (0 disables waiting); `storage` replaces
// localStorage; `now` replaces the clock.
export function configureMock(options = {}) {
  if ("latency" in options) config.latency = Array.isArray(options.latency) ? options.latency : [options.latency, options.latency];
  if ("storage" in options) config.storage = options.storage;
  if ("now" in options) config.now = options.now ?? (() => Date.now());
}

const memory = new Map();
const memoryStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => void memory.set(k, String(v)),
  removeItem: (k) => void memory.delete(k),
};

function storage() {
  if (config.storage) return config.storage;
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      ls.setItem("__probe", "1");
      ls.removeItem("__probe");
      return ls;
    }
  } catch {
    // Storage blocked (private mode, disabled cookies): fall back to memory below.
  }
  return memoryStorage;
}

const wait = () => {
  const [lo, hi] = config.latency;
  if (!hi) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, lo + Math.random() * (hi - lo)));
};

function readJson(key) {
  try {
    const raw = storage().getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // Quota or blocked storage: the in-memory copy still works for this page load.
  }
}

let cache = null;
function data() {
  if (cache) return cache;
  const stored = readJson(DATA_KEY);
  if (stored && stored.version === SEED_VERSION && Array.isArray(stored.businesses)) {
    cache = stored;
  } else {
    cache = buildSeed(config.now());
    writeJson(DATA_KEY, cache);
  }
  return cache;
}

export function resetMock() {
  cache = null;
  try {
    storage().removeItem(DATA_KEY);
    storage().removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
  memory.clear();
  notify(null);
}

// ---- auth ---------------------------------------------------------------------------------

const listeners = new Set();
const notify = (session) => listeners.forEach((fn) => fn(session));

const publicSession = (s) => ({ user: { id: s.id, email: s.email, displayName: s.displayName, role: s.role }, expiresAt: s.expiresAt });

function currentSession() {
  const s = readJson(SESSION_KEY);
  if (!s || s.expiresAt <= config.now()) return null;
  return s;
}

function requireSession() {
  if (!currentSession()) throw new ApiError("unauthorized");
}

export const auth = {
  async getSession() {
    await wait();
    const s = currentSession();
    return s ? publicSession(s) : null;
  },
  async signIn({ email, password } = {}) {
    await wait();
    const account = DEMO_ACCOUNTS.find((a) => a.email === String(email ?? "").trim().toLowerCase());
    if (!account || account.password !== password) throw new ApiError("invalid_credentials");
    const session = { ...account, expiresAt: config.now() + SESSION_MS };
    delete session.password;
    writeJson(SESSION_KEY, session);
    const out = publicSession(session);
    notify(out);
    return out;
  },
  async signOut() {
    await wait();
    try {
      storage().removeItem(SESSION_KEY);
    } catch {
      // Already gone.
    }
    notify(null);
  },
  // Returns an unsubscribe function.
  onChange(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
};

// ---- counts and search --------------------------------------------------------------------

function countsUnchecked() {
  const { businesses, applications } = data();
  const now = config.now();
  const horizon = now + EXPIRING_DAYS * 24 * 60 * 60 * 1000;
  return withBrief(
    {
      liveBusinesses: businesses.filter((b) => b.status === "live").length,
      applicationsWaiting: applications.filter((a) => WAITING_APPLICATION_STATUSES.includes(a.status)).length,
      unconfirmedPayments: applications.filter((a) => a.status === CONFIRMING_STATUS).length,
      expiringSoon: businesses.filter((b) => {
        if (b.status !== "live" || !b.paid_until) return false;
        const t = Date.parse(b.paid_until);
        return t >= now && t <= horizon;
      }).length,
    },
    now,
  );
}

export async function adminCounts() {
  await wait();
  requireSession();
  return countsUnchecked();
}

const matches = (def, row, term) => {
  const needle = term.toLowerCase();
  return def.searchFields.some((f) => String(row[f] ?? "").toLowerCase().includes(needle));
};

export async function adminSearch(query, { limit = SEARCH_LIMIT } = {}) {
  await wait();
  requireSession();
  const term = cleanTerm(query);
  if (term.length < MIN_SEARCH_LENGTH) return groupSearch(term, []);
  const cap = Math.min(Math.max(1, Math.floor(Number(limit) || SEARCH_LIMIT)), 20);
  const groups = RESOURCE_NAMES.map((name) => {
    const def = resourceDef(name);
    const rows = data()[name].filter((r) => matches(def, r, term)).slice(0, cap);
    return { kind: name, label: def.label, items: rows.map((r) => toSearchResult(def, r)) };
  });
  return groupSearch(term, groups);
}

// ---- list and get -------------------------------------------------------------------------

const compare = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
};

function listUnchecked(resource, params) {
  const def = resourceDef(resource);
  const p = normalizeListParams(def, params);
  let rows = data()[def.name];

  for (const [key, value] of Object.entries(p.filters)) {
    rows = rows.filter((r) => (Array.isArray(value) ? value.includes(r[key]) : r[key] === value));
  }
  if (p.query) rows = rows.filter((r) => matches(def, r, p.query));

  const dir = p.sort.direction === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const av = a[p.sort.column];
    const bv = b[p.sort.column];
    // Nulls stay last in both directions, like `nullsFirst: false` in the live query.
    if (av == null || bv == null) return compare(av, bv) || compare(a[def.id], b[def.id]);
    return dir * compare(av, bv) || compare(a[def.id], b[def.id]);
  });

  const from = (p.page - 1) * p.pageSize;
  return {
    rows: rows.slice(from, from + p.pageSize).map((r) => pick(r, def.listColumns)),
    total: rows.length,
    page: p.page,
    pageSize: p.pageSize,
  };
}

export async function list(resource, params = {}) {
  await wait();
  requireSession();
  return listUnchecked(resource, params);
}

export async function get(resource, id) {
  await wait();
  requireSession();
  const def = resourceDef(resource);
  const row = data()[def.name].find((r) => r[def.id] === id);
  if (!row) throw new ApiError("not_found");
  return pick(row, def.detailColumns);
}

// ---- deprecated placeholder getters --------------------------------------------------------
// The pre-B1 placeholder pages call these without signing in. They skip the session check and are
// removed with the placeholders.

export async function getAdminCounts() {
  await wait();
  return countsUnchecked();
}

const legacy = makeLegacy(async (resource, params) => {
  await wait();
  return listUnchecked(resource, params);
});
export const { getApplications, getBusinesses, getPayments } = legacy;
