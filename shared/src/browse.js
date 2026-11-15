// Department browse helpers (A23/C24). Pure, no I/O.

/** Breadcrumb steps for a department page: [{ id, name, to }], the last one without `to`. */
export function departmentTrail(department, type = null) {
  if (!department?.id) return [];
  const dept = { id: department.id, name: department.name, to: `/d/${department.id}` };
  if (!type?.id) return [{ id: dept.id, name: dept.name }];
  return [dept, { id: type.id, name: type.name }];
}

/** Items grouped by department for a mixed shop. Departments keep the order given; items with none go last under "Other". */
export function groupItemsByDepartment(items, departments = []) {
  const known = new Map(departments.filter((d) => d?.id).map((d, order) => [d.id, { id: d.id, name: d.name, order, items: [] }]));
  const other = { id: null, name: "Other", order: Number.MAX_SAFE_INTEGER, items: [] };
  for (const item of Array.isArray(items) ? items : []) {
    const group = known.get(item?.departmentId) ?? other;
    group.items.push(item);
  }
  return [...known.values(), other].filter((g) => g.items.length).sort((a, b) => a.order - b.order);
}

/** True when a shop's items span more than one group, so it is worth showing department sections. */
export const isMixedShop = (departments) => (Array.isArray(departments) ? departments.filter((d) => d.count > 0).length : 0) > 1;
