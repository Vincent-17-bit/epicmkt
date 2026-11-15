// Demo data for the Relations page (migration 0109): which kinds of product shoppers also like to see beside each other.
const wait = () => new Promise((r) => setTimeout(r, 0));
const clone = (v) => JSON.parse(JSON.stringify(v));
const fail = (code) => Object.assign(new Error(code), { code });

const types = [{ id: "phone", name: "Phone", departmentId: "phones" }, { id: "case", name: "Phone case", departmentId: "phones" }, { id: "sofa", name: "Sofa", departmentId: "furniture" }, { id: "rug", name: "Rug", departmentId: "furniture" }];
const departments = [{ id: "phones", name: "Phones" }, { id: "furniture", name: "Furniture" }];
const nameOf = (kind, id) => (kind === "type" ? types : departments).find((x) => x.id === id)?.name ?? null;
const seed = () => [
  { id: "r1", fromKind: "type", fromId: "phone", toKind: "type", toId: "case", weight: 8, active: true },
  { id: "r2", fromKind: "department", fromId: "furniture", toKind: "department", toId: "phones", weight: 2, active: false }
];
let relations = seed();
let n = 10;
export const resetRelationsMock = () => { relations = seed(); n = 10; };
const view = (r) => ({ ...r, fromName: nameOf(r.fromKind, r.fromId), toName: nameOf(r.toKind, r.toId) });

export async function listRelations() {
  await wait();
  return clone({ relations: relations.map(view), types, departments });
}
export async function saveRelation({ fromKind, fromId, toKind, toId, weight = 0, active = true }) {
  await wait();
  if (!["type", "department"].includes(fromKind) || !["type", "department"].includes(toKind)) throw fail("invalid_relation_kind");
  if (fromKind === toKind && fromId === toId) throw fail("relation_to_self");
  if (!Number.isInteger(weight) || weight < 0 || weight > 10) throw fail("invalid_relation_weight");
  if (nameOf(fromKind, fromId) === null || nameOf(toKind, toId) === null) throw fail("unknown_relation_target");
  const old = relations.find((r) => r.fromKind === fromKind && r.fromId === fromId && r.toKind === toKind && r.toId === toId);
  const next = { id: old?.id ?? `r${n++}`, fromKind, fromId, toKind, toId, weight, active: Boolean(active) };
  relations = old ? relations.map((r) => (r === old ? next : r)) : [...relations, next];
  return clone(next);
}
export async function deleteRelation(id) {
  await wait();
  if (!relations.some((r) => r.id === id)) throw fail("relation_not_found");
  relations = relations.filter((r) => r.id !== id);
}
