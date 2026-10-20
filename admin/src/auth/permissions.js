// Who may do what in the admin app.
//
// This mirrors what the database and the edge functions enforce today:
//   - row-level security and has_role() in supabase/migrations/0008_admin.sql, 0013, 0015 and 0016
//   - the role lists in the admin edge functions (admin-export, admin-message, ...)
// The database and the functions are the real gate. This table only decides what the screen shows, hides or
// disables, and the sentence that explains why. If the two ever disagree, the database wins.
//
// The owner passes every check, exactly like has_role() in SQL and requireAdmin() in TypeScript.

export const ROLES = ["owner", "reviewer", "finance", "support"];

export const ROLE_LABELS = { owner: "Owner", reviewer: "Reviewer", finance: "Finance", support: "Support" };
const ROLE_PLURALS = { owner: "Owners", reviewer: "Reviewers", finance: "Finance admins", support: "Support admins" };

const ANY = ["reviewer", "finance", "support"]; // any admin; the owner is always implied

export const ACTIONS = {
  "applications.view": { label: "open applications", roles: ["reviewer"] },
  "applications.decide": { label: "approve, reject or return applications", roles: ["reviewer"] },
  "documents.view": { label: "open application documents", roles: ["reviewer"] },
  "businesses.view": { label: "see businesses", roles: ANY },
  "businesses.visibility": { label: "hide or show a business", roles: ["reviewer", "support"] },
  "businesses.bulk": { label: "suspend, tag, feature, message or export businesses in bulk", roles: ["reviewer", "support"] },
  "businesses.extend": { label: "extend subscriptions", roles: ["finance"] },
  "payments.view": { label: "see payments", roles: ANY },
  "payments.confirm": { label: "confirm, reject or assign payments", roles: ["finance"] },
  "moderation.view": { label: "see flags and reports", roles: ["reviewer", "support"] },
  "moderation.resolve": { label: "resolve flags and reports", roles: ["reviewer", "support"] },
  "messages.view": { label: "see seller messages", roles: ["reviewer", "support"] },
  "messages.send": { label: "message sellers", roles: ["reviewer", "support"] },
  "flash.view": { label: "see flash sales", roles: ["reviewer", "support"] },
  "flash.end": { label: "end a flash sale", roles: ["reviewer", "support"] },
  "activity.view": { label: "see the live activity feed", roles: ["reviewer"] },
  "audit.view": { label: "read the audit log", roles: ANY },
  "catalogue.edit": { label: "edit categories, plans and content", roles: [] },
  "settings.view": { label: "open settings", roles: [] },
  "settings.edit": { label: "change settings", roles: [] },
  "admins.manage": { label: "manage admin accounts", roles: [] },
  "security.view": { label: "see your sessions", roles: ANY },
};

export function isRole(role) {
  return ROLES.includes(role);
}

/** Fails closed: an unknown role or an unknown action is never allowed. */
export function roleCan(role, action) {
  const rule = ACTIONS[action];
  if (!rule || !isRole(role)) return false;
  return role === "owner" || rule.roles.includes(role);
}

function listRoles(roles) {
  const names = ["owner", ...roles].map((r) => ROLE_PLURALS[r]);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The sentence shown next to a hidden or disabled action. Returns "" when the action is allowed. */
export function explain(role, action) {
  if (roleCan(role, action)) return "";
  const rule = ACTIONS[action];
  if (!rule) return "This action is not available.";
  const who = isRole(role) ? `You are signed in as ${ROLE_LABELS[role]}.` : "Your account has no admin role.";
  return `Only ${listRoles(rule.roles)} can ${rule.label}. ${who}`;
}
