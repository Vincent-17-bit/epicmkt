import { supabase } from "./applications/supabaseClient";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitReport({ businessId, reason, message = "", contact = "" } = {}) {
  if (!UUID.test(String(businessId ?? ""))) throw Object.assign(new Error("Business not found"), { name: "NotFoundError" });
  const { data, error } = await supabase.rpc("submit_report", { p_business: businessId, p_reason: reason, p_message: message, p_contact: contact });
  if (error) throw Object.assign(new Error(error.message || "request_failed"), { name: "ReportError" });
  if (data?.ok) return { ok: true };
  if (data?.error === "invalid") throw Object.assign(new Error("Please fix the highlighted fields"), { name: "ValidationError", fields: data.fields ?? {} });
  throw Object.assign(new Error(data?.error || "request_failed"), { name: data?.error === "not_found" ? "NotFoundError" : "ReportError" });
}
