// The admin app talks to one API object. It is live (Supabase) when VITE_SUPABASE_URL is set and
// the built-in mock otherwise; both modules export the same names with the same signatures.
//
//   auth.getSession()                 -> { user: { id, email, displayName, role }, expiresAt } | null
//   auth.signIn({ email, password })  -> session, or throws ApiError("invalid_credentials" | "not_admin")
//   auth.signOut()
//   auth.onChange(callback)           -> unsubscribe function; callback gets a session or null
//   adminCounts()                     -> { liveBusinesses, applicationsWaiting, unconfirmedPayments,
//                                          expiringSoon, brief, asOf }
//   adminSearch(query, { limit })     -> { query, total, groups: [{ kind, label, items: [...] }] }
//   list(resource, { page, pageSize, query, filters, sort }) -> { rows, total, page, pageSize }
//   get(resource, id)                 -> row, or throws ApiError("not_found")
//
// Resources are listed in ./resources.js. Rows use real database column names.

import * as live from "./live.js";
import * as mock from "./mock.js";

const isLive = Boolean(import.meta.env?.VITE_SUPABASE_URL);

export const api = isLive ? live : mock;

export const { auth, adminCounts, adminSearch, list, get } = api;
export { ApiError } from "./errors.js";
export { RESOURCES, RESOURCE_NAMES } from "./resources.js";
export const isMockApi = !isLive;

export default api;
