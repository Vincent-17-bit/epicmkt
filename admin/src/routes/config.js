// The admin route table. Pure data, so the shell, the nav, the breadcrumb and the tests all read the same thing.
// `permission` is the action a role needs to open the page (see auth/permissions.js). `badge` says how the sidebar
// number is made from the admin_counts() keys.
import { roleCan } from "../auth/permissions.js";

export const ROUTES = [
  { id: "command", path: "", title: "Command Center", section: "Overview", icon: "gauge", permission: null },
  { id: "applications", path: "applications", title: "Applications", section: "Review", icon: "file", permission: "applications.view", badge: ["submitted"] },
  { id: "changes", path: "changes", title: "Change requests", section: "Review", icon: "pen", permission: "changes.view", badge: ["pending_changes"] },
  { id: "businesses", path: "businesses", title: "Businesses", section: "Marketplace", icon: "store", permission: "businesses.view", badge: ["expiring_7d", "in_grace"] },
  { id: "moderation", path: "moderation", title: "Flags and reports", section: "Marketplace", icon: "flag", permission: "moderation.view", badge: ["open_flags", "open_reports"] },
  { id: "payments", path: "payments", title: "Payments", section: "Money", icon: "money", permission: "payments.view", badge: ["unconfirmed_payments"] },
  { id: "messages", path: "messages", title: "Messages", section: "Communication", icon: "mail", permission: "messages.view", badge: ["failed_messages"], badgeTone: "danger" },
  { id: "audit", path: "audit", title: "Audit log", section: "Records", icon: "history", permission: "audit.view" },
  { id: "settings", path: "settings", title: "Settings", section: "System", icon: "gear", permission: "settings.view" },
  // Reached from the avatar menu rather than the sidebar.
  { id: "security", path: "security", title: "Security and sessions", section: "Account", icon: "shield", permission: "security.view", menu: false },
];

export const NAV_ROUTES = ROUTES.filter((route) => route.menu !== false);

export const hrefOf = (route) => (route.path ? `/admin/${route.path}` : "/admin");

/** The route for a pathname, or undefined for an unknown one. */
export function findRoute(pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return ROUTES.find((route) => hrefOf(route) === clean);
}

export const visibleRoutes = (role) =>
  NAV_ROUTES.filter((route) => !route.permission || roleCan(role, route.permission));

export function badgeFor(route, counts) {
  if (!route.badge || !counts) return 0;
  return route.badge.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

/** The first routes this role can open, for the phone bottom bar. The rest sit behind "More". */
export const bottomBarRoutes = (role, max = 4) => visibleRoutes(role).slice(0, max);
