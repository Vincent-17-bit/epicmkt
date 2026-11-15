// Demo data for the Departments and Type requests pages (migration 0118 / 0091).
const wait = () => new Promise((r) => setTimeout(r, 0));
const clone = (v) => JSON.parse(JSON.stringify(v));

const seedDepartments = () => [
  { id: "phones", name: "Phones", sort: 1, active: true, types: 3, items: 42 },
  { id: "furniture", name: "Furniture", sort: 2, active: true, types: 4, items: 17 },
  { id: "fragrance", name: "Fragrance", sort: 3, active: false, types: 1, items: 0 }
];
const seedRequests = () => [
  { id: "r1", name: "Smart watch", note: "We sell about 30 models", status: "pending", created_at: "2026-11-10T08:00:00Z", businessId: "s1", businessName: "Mobile Hub", categoryId: "electronics", alsoAskedBy: 2, adminNote: null, resolvedTypeId: null },
  { id: "r2", name: "Baby cot", note: null, status: "pending", created_at: "2026-11-12T08:00:00Z", businessId: "s2", businessName: "Little Ones", categoryId: "kids", alsoAskedBy: 0, adminNote: null, resolvedTypeId: null }
];
let departments = seedDepartments();
let requests = seedRequests();
const types = [{ id: "phone", name: "Phone" }, { id: "wearable", name: "Wearable" }, { id: "cot", name: "Cot" }];

/** Test helper: back to the starting demo data. */
export const resetDepartmentsMock = () => { departments = seedDepartments(); requests = seedRequests(); };

export async function listDepartments() { await wait(); return clone(departments); }
export async function saveDepartment(id, fields) {
  await wait();
  const key = String(id ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key) || key.length > 40) throw Object.assign(new Error("invalid_id"), { code: "invalid_id" });
  const old = departments.find((d) => d.id === key);
  const name = "name" in fields ? String(fields.name ?? "").trim() : old?.name;
  if (!name || name.length < 2 || name.length > 60) throw Object.assign(new Error("invalid_name"), { code: "invalid_name" });
  if (departments.some((d) => d.id !== key && d.name.toLowerCase() === name.toLowerCase())) throw Object.assign(new Error("name_taken"), { code: "name_taken" });
  if (old && fields.active === false && old.items > 0) throw Object.assign(new Error("department_in_use"), { code: "department_in_use" });
  const next = { id: key, name, sort: Number.isInteger(fields.sort) ? fields.sort : old?.sort ?? 0, active: "active" in fields ? Boolean(fields.active) : old?.active ?? true, types: old?.types ?? 0, items: old?.items ?? 0 };
  departments = old ? departments.map((d) => (d.id === key ? next : d)) : [...departments, next];
  departments.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  return key;
}
export async function listTypeRequests(status = "pending") {
  await wait();
  return clone(requests.filter((r) => status === "all" || r.status === status));
}
export async function listRequestTypes() { await wait(); return clone(types); }
export async function resolveTypeRequest(id, outcome, typeId = null, note = null) {
  await wait();
  const r = requests.find((x) => x.id === id);
  if (!r || r.status !== "pending") throw Object.assign(new Error("not_pending"), { code: "not_pending" });
  if (outcome === "resolved" && !types.some((t) => t.id === typeId)) throw Object.assign(new Error("invalid_type"), { code: "invalid_type" });
  if (outcome === "declined" && !String(note ?? "").trim()) throw Object.assign(new Error("note_required"), { code: "note_required" });
  r.status = outcome; r.resolvedTypeId = typeId; r.adminNote = note;
}
