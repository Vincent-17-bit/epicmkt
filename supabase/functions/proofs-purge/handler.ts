import { json, wrap, type Deps } from "../_shared/seller.ts";

// Run daily (pg_cron + pg_net, or a scheduled function call) with the x-cron-secret header.
// Deletes proofs 90 days after their flag was resolved, and uploads that were never finalized.
export const proofsPurge = (d: Deps) => wrap(async (req) => {
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!d.cronSecret || secret !== d.cronSecret) return json({ error: "unauthorized" }, 401);
  const due = await d.db.rpc("proofs_due_for_purge", {});
  if (due.error) return json({ error: "server_error" }, 500);
  const rows: { id: string; path: string }[] = due.data ?? [];
  if (!rows.length) return json({ purged: 0 });
  const removed = await d.db.storage.from("seller-proofs").remove(rows.map((r) => r.path));
  if (removed.error) return json({ error: "server_error" }, 500);
  await d.db.from("flag_attachments").delete().in("id", rows.map((r) => r.id));
  await d.db.from("audit_log").insert({ actor_role: "system", action: "proofs_purged", entity: "flag_attachment", data: { count: rows.length } });
  return json({ purged: rows.length });
});
