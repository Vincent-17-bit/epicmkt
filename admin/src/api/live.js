// Live admin API on Supabase. Same exports and signatures as mock.js. Row-level security is the
// real gate: every query runs as the signed-in person, and `admins.role` decides what they may do.
// Only the public anon key is used here; the service role key never reaches the browser.

import { createClient } from "@supabase/supabase-js";
import { ApiError, fromSupabase } from "./errors.js";
import { MIN_SEARCH_LENGTH, buildSearchFilter, cleanTerm, normalizeListParams } from "./query.js";
import { RESOURCE_NAMES, resourceDef } from "./resources.js";
import {
  CONFIRMING_STATUS,
  EXPIRING_DAYS,
  WAITING_APPLICATION_STATUSES,
  groupSearch,
  makeLegacy,
  toSearchResult,
  withBrief,
} from "./shape.js";

const SEARCH_LIMIT = 5;
const OUT_OF_RANGE = "PGRST103"; // asked for a page past the end

export function createLiveApi(getClient) {
  const roleCache = new Map(); // user id -> { role, displayName }

  const run = async (promise) => {
    try {
      const result = await promise;
      if (result?.error) throw fromSupabase(result.error);
      return result;
    } catch (e) {
      throw fromSupabase(e);
    }
  };

  async function adminProfile(user) {
    if (roleCache.has(user.id)) return roleCache.get(user.id);
    const { data } = await run(
      getClient().from("admins").select("role,display_name").eq("user_id", user.id).maybeSingle(),
    );
    if (!data) return null;
    const profile = { role: data.role, displayName: data.display_name || user.email };
    roleCache.set(user.id, profile);
    return profile;
  }

  async function toSession(supabaseSession) {
    if (!supabaseSession?.user) return null;
    const { user } = supabaseSession;
    const profile = await adminProfile(user);
    if (!profile) return null;
    return {
      user: { id: user.id, email: user.email, displayName: profile.displayName, role: profile.role },
      expiresAt: (supabaseSession.expires_at ?? 0) * 1000,
    };
  }

  const auth = {
    async getSession() {
      const { data } = await run(getClient().auth.getSession());
      const session = await toSession(data?.session);
      // A signed-in person who is not an admin must not keep a live session in this app.
      if (data?.session && !session) await getClient().auth.signOut();
      return session;
    },
    async signIn({ email, password } = {}) {
      const { data, error } = await getClient().auth.signInWithPassword({
        email: String(email ?? "").trim(),
        password: String(password ?? ""),
      });
      if (error) {
        throw error.status === 400 || /invalid/i.test(error.message ?? "")
          ? new ApiError("invalid_credentials")
          : fromSupabase(error);
      }
      const session = await toSession(data.session);
      if (!session) {
        await getClient().auth.signOut();
        throw new ApiError("not_admin");
      }
      return session;
    },
    async signOut() {
      roleCache.clear();
      await run(getClient().auth.signOut());
    },
    // Returns an unsubscribe function. Supabase calls are deferred out of its callback on purpose:
    // awaiting a client call inside onAuthStateChange can deadlock the client.
    onChange(callback) {
      const { data } = getClient().auth.onAuthStateChange((_event, session) => {
        setTimeout(async () => {
          try {
            callback(await toSession(session));
          } catch {
            callback(null);
          }
        }, 0);
      });
      return () => data.subscription.unsubscribe();
    },
  };

  const head = (table, apply) => {
    const q = getClient().from(table).select("id", { count: "exact", head: true });
    return run(apply(q)).then((r) => r.count ?? 0);
  };

  async function adminCounts() {
    const now = Date.now();
    const horizon = new Date(now + EXPIRING_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [liveBusinesses, applicationsWaiting, unconfirmedPayments, expiringSoon] = await Promise.all([
      head("businesses", (q) => q.eq("status", "live")),
      head("applications", (q) => q.in("status", WAITING_APPLICATION_STATUSES)),
      head("applications", (q) => q.eq("status", CONFIRMING_STATUS)),
      head("businesses", (q) =>
        q.eq("status", "live").gte("paid_until", new Date(now).toISOString()).lte("paid_until", horizon),
      ),
    ]);
    return withBrief({ liveBusinesses, applicationsWaiting, unconfirmedPayments, expiringSoon }, now);
  }

  async function adminSearch(query, { limit = SEARCH_LIMIT } = {}) {
    const term = cleanTerm(query);
    if (term.length < MIN_SEARCH_LENGTH) return groupSearch(term, []);
    const cap = Math.min(Math.max(1, Math.floor(Number(limit) || SEARCH_LIMIT)), 20);
    const groups = await Promise.all(
      RESOURCE_NAMES.map(async (name) => {
        const def = resourceDef(name);
        const { data } = await run(
          getClient()
            .from(def.table)
            .select(def.listColumns.join(","))
            .or(buildSearchFilter(def.searchFields, term))
            .order(def.defaultSort.column, { ascending: def.defaultSort.direction === "asc", nullsFirst: false })
            .limit(cap),
        );
        return { kind: name, label: def.label, items: (data ?? []).map((r) => toSearchResult(def, r)) };
      }),
    );
    return groupSearch(term, groups);
  }

  async function list(resource, params = {}) {
    const def = resourceDef(resource);
    const p = normalizeListParams(def, params);
    const from = (p.page - 1) * p.pageSize;

    let q = getClient().from(def.table).select(def.listColumns.join(","), { count: "exact" });
    for (const [key, value] of Object.entries(p.filters)) q = Array.isArray(value) ? q.in(key, value) : q.eq(key, value);
    if (p.query) q = q.or(buildSearchFilter(def.searchFields, p.query));
    q = q
      .order(p.sort.column, { ascending: p.sort.direction === "asc", nullsFirst: false })
      .order(def.id, { ascending: true }) // stable order between pages
      .range(from, from + p.pageSize - 1);

    const result = await q;
    if (result.error?.code === OUT_OF_RANGE) {
      // The page is past the end (for example the last row was just removed). Report the real total.
      let c = getClient().from(def.table).select(def.id, { count: "exact", head: true });
      for (const [key, value] of Object.entries(p.filters)) c = Array.isArray(value) ? c.in(key, value) : c.eq(key, value);
      if (p.query) c = c.or(buildSearchFilter(def.searchFields, p.query));
      const counted = await run(c);
      return { rows: [], total: counted.count ?? 0, page: p.page, pageSize: p.pageSize };
    }
    if (result.error) throw fromSupabase(result.error);
    return { rows: result.data ?? [], total: result.count ?? 0, page: p.page, pageSize: p.pageSize };
  }

  async function get(resource, id) {
    const def = resourceDef(resource);
    const columns = def.detailColumns ? def.detailColumns.join(",") : "*";
    const { data } = await run(getClient().from(def.table).select(columns).eq(def.id, id).maybeSingle());
    if (!data) throw new ApiError("not_found");
    return data;
  }

  return { auth, adminCounts, adminSearch, list, get };
}

let client = null;
function lazyClient() {
  if (client) return client;
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new ApiError("not_configured", "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use live data.");
  }
  client = createClient(url, key, {
    // A key of its own so a seller or shopper session on the same origin never signs in the admin app.
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "epicmkt-admin-auth" },
  });
  return client;
}

const api = createLiveApi(lazyClient);

export const { auth, adminCounts, adminSearch, list, get } = api;

// ---- deprecated placeholder getters (removed with the placeholder pages) --------------------

export const getAdminCounts = adminCounts;
export const { getApplications, getBusinesses, getPayments } = makeLegacy(list);
