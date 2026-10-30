// Works out the page title and breadcrumb trail for a route. Pure functions, no React or router.
//
// `groups` is the sidebar structure: [{ label?, items: [{ label, to, end? }] }]. A group label is a section name,
// not a page, so it shows in the trail as plain text. Detail pages are listed in DETAIL_ROUTES below.

const DETAIL_ROUTES = [
  { pattern: /^\/admin\/applications\/[^/]+$/, parent: "/admin/applications", label: "Application details" },
  { pattern: /^\/admin\/businesses\/[^/]+$/, parent: "/admin/businesses", label: "Business details" },
];

const EXTRA_PAGES = { "/admin/account": "Account" };

export const normalizePath = (pathname) => (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname);

export function isItemActive(item, pathname) {
  const path = normalizePath(pathname);
  return item.end ? path === item.to : path === item.to || path.startsWith(`${item.to}/`);
}

function findItem(groups, pathname) {
  let best = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (isItemActive(item, pathname) && (!best || item.to.length > best.item.to.length)) best = { group, item };
    }
  }
  return best;
}

/** Returns { title, crumbs }. `crumbs` is an ordered list of { label, to? }; only the last one is the current page. */
export function buildCrumbs(pathname, groups) {
  const path = normalizePath(pathname);

  const detail = DETAIL_ROUTES.find((route) => route.pattern.test(path));
  if (detail) {
    const parent = findItem(groups, detail.parent);
    const crumbs = [
      ...(parent?.group.label ? [{ label: parent.group.label }] : []),
      ...(parent ? [{ label: parent.item.label, to: parent.item.to }] : []),
      { label: detail.label },
    ];
    return { title: detail.label, crumbs };
  }

  const found = findItem(groups, path);
  if (found) {
    const crumbs = [...(found.group.label ? [{ label: found.group.label }] : []), { label: found.item.label }];
    return { title: found.item.label, crumbs };
  }

  const extra = EXTRA_PAGES[path];
  const label = extra ?? "Admin";
  return { title: label, crumbs: [{ label }] };
}
