// Department browse (migration 0118). Live reads the public functions; the demo backend has no departments, so it shows none.
import { isLive } from "./flash/mode.js";
import { mediaUrl } from "./flash/shape.js";

const live = () => import("./applications/supabaseClient");

const EMPTY = { department: null, type: null, total: 0, items: [] };

export const cardOfDepartmentItem = (row) => ({
  id: row.id,
  name: row.name,
  price: row.price ?? null,
  priceMax: row.priceMax ?? null,
  priceType: row.priceType ?? "fixed",
  hasOptions: Boolean(row.hasOptions),
  brand: row.brand ?? null,
  image: mediaUrl(Array.isArray(row.imagePaths) ? row.imagePaths[0] : null),
  shop: row.business ? { id: row.business.id, slug: row.business.slug, name: row.business.name, town: row.business.town ?? null } : null
});

export async function getDepartments() {
  if (!isLive()) return [];
  try {
    const { supabase } = await live();
    const { data, error } = await supabase.rpc("public_departments");
    return error || !Array.isArray(data) ? [] : data;
  } catch {
    return [];
  }
}

export async function getDepartmentBrowse(department, type, { limit = 24, offset = 0 } = {}) {
  if (!isLive()) return EMPTY;
  const { supabase } = await live();
  const { data, error } = await supabase.rpc("public_department_browse", { p_department: department, p_type: type ?? null, p_limit: limit, p_offset: offset });
  if (error) throw new Error("department_unavailable");
  return { ...EMPTY, ...data, items: (data?.items ?? []).map(cardOfDepartmentItem) };
}

export async function getShopDepartments(businessId) {
  if (!isLive() || !businessId) return [];
  try {
    const { supabase } = await live();
    const { data, error } = await supabase.rpc("public_shop_departments", { p_business: businessId });
    return error || !Array.isArray(data) ? [] : data;
  } catch {
    return [];
  }
}
