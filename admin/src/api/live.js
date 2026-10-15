import { supabase } from "../lib/supabase.js";
import { normalizeCounts } from "./counts.js";
import { buildDashboard } from "./dashboard.js";
import { monthKeys, monthStartIso } from "../lib/series.js";

/** One RPC, role-checked in SQL (public.admin_counts). Non-admins get an empty object, which normalises to zeros. */
export async function getAdminCounts() {
  const { data, error } = await supabase.rpc("admin_counts");
  if (error) throw new Error("Could not load the admin counts.");
  return normalizeCounts(data);
}

// ---------------------------------------------------------------------------------------------------------------
// Command Center (B1c). Everything below runs as the signed-in admin, so row-level security decides what comes back:
// a role that cannot read a table simply sees zeros and empty lists. PostgREST returns at most 1000 rows per request,
// which is plenty for 14 days or 6 months of a marketplace this size; counts that must be exact use head counts.
// ---------------------------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const ok = ({ data, count, error }) => {
  if (error) throw new Error("Could not load the dashboard.");
  return { data: data ?? [], count: count ?? 0 };
};

export async function getDashboard() {
  const now = new Date();
  const iso = (ms) => new Date(ms).toISOString();
  const nowIso = now.toISOString();
  const since14 = iso(now.getTime() - 14 * DAY);
  const ahead14 = iso(now.getTime() + 14 * DAY);
  const since6m = monthStartIso(monthKeys(6, now)[0].key);
  const oldest = (table, column, filter) => filter(supabase.from(table).select(column)).order(column, { ascending: true }).limit(1).then(ok); // filters first: they only exist before order/limit

  const [over24, oldestApp, oldestPay, oldestFlag, oldestMsg, oldestChange, nextExpiry, apps, pays, confirmed, activations, lapses, upcoming] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "submitted").lt("submitted_at", iso(now.getTime() - DAY)).then(ok),
    supabase.from("applications").select("id,submitted_at").eq("status", "submitted").order("submitted_at", { ascending: true }).limit(1).then(ok),
    oldest("payments", "created_at", (q) => q.eq("status", "submitted")),
    oldest("flags", "created_at", (q) => q.in("status", ["open", "replied"])),
    oldest("messages", "created_at", (q) => q.eq("status", "failed")),
    oldest("change_requests", "created_at", (q) => q.eq("status", "pending")),
    oldest("businesses", "paid_until", (q) => q.eq("status", "live").is("deleted_at", null).gte("paid_until", nowIso)),
    supabase.from("applications").select("submitted_at").gte("submitted_at", since14).then(ok),
    supabase.from("payments").select("created_at").gte("created_at", since14).then(ok),
    supabase.from("payments").select("confirmed_at,amount_kes").eq("status", "confirmed").gte("confirmed_at", since6m).then(ok),
    supabase.from("businesses").select("first_paid_at").gte("first_paid_at", since6m).then(ok),
    supabase.from("businesses").select("paid_until").is("deleted_at", null).gte("paid_until", since6m).lt("paid_until", nowIso).then(ok),
    supabase.from("businesses").select("paid_until").eq("status", "live").is("deleted_at", null).gte("paid_until", nowIso).lt("paid_until", ahead14).then(ok),
  ]);

  const first = (result, column) => result.data[0]?.[column] ?? null;
  return buildDashboard({
    waitingOver24h: over24.count,
    oldest: {
      applications: oldestApp.data[0] ? { id: oldestApp.data[0].id, at: oldestApp.data[0].submitted_at } : null,
      payments: first(oldestPay, "created_at"),
      flags: first(oldestFlag, "created_at"),
      failedMessages: first(oldestMsg, "created_at"),
      changes: first(oldestChange, "created_at"),
      expiry: first(nextExpiry, "paid_until"),
    },
    applications: apps.data, payments: pays.data, confirmed: confirmed.data, activations: activations.data, lapses: lapses.data, upcoming: upcoming.data,
  }, now);
}

/** The newest notifications (with the business name) and how many are unread. */
export async function getNotifications({ limit = 30 } = {}) {
  const [list, unread] = await Promise.all([
    supabase.from("admin_notifications").select("id,kind,business_id,data,read_at,created_at,business:businesses(name)").order("created_at", { ascending: false }).limit(limit).then(ok),
    supabase.from("admin_notifications").select("id", { count: "exact", head: true }).is("read_at", null).then(ok),
  ]);
  return { items: list.data, unread: unread.count };
}

/** ids = an array of notification ids, or "all" for every unread one. */
export async function markNotificationsRead(ids) {
  let query = supabase.from("admin_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (ids !== "all") query = query.in("id", ids);
  const { error } = await query;
  if (error) throw new Error("Could not mark the notifications as read.");
}

/** Inline action on the queue: take the next application. The database moves it to under_review for this admin. */
export async function startReview(applicationId) {
  const { data, error } = await supabase.rpc("admin_open_application", { p_id: applicationId });
  if (error) throw new Error(error.message === "forbidden" ? "Your role cannot start a review." : "Could not start the review.");
  return data;
}

/**
 * Realtime. Changes in the work tables only say "something moved" (onChange); a new admin_notifications row is the
 * one that gets a toast (onNotification). RLS still applies, so a role only hears about rows it may read.
 * onStatus gets "connecting" | "live" | "offline". Returns the unsubscribe function.
 */
export function subscribeLive({ onChange, onNotification, onStatus } = {}) {
  const channel = supabase.channel("admin-live");
  for (const table of ["applications", "payments", "flags", "reports", "messages"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => onChange?.(table));
  }
  channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, (payload) => {
    onChange?.("admin_notifications");
    onNotification?.(payload.new);
  });
  channel.subscribe((status) => {
    onStatus?.(status === "SUBSCRIBED" ? "live" : status === "CONNECTING" || status === "JOINING" ? "connecting" : "offline");
  });
  return () => { supabase.removeChannel(channel); };
}
