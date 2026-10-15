// Admin roles. Must match the admins.role check constraint in migration 0008 and public.has_role().
export const ADMIN_ROLES = ["owner", "reviewer", "finance", "support"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const isAdminRole = (v: unknown): v is AdminRole => typeof v === "string" && (ADMIN_ROLES as readonly string[]).includes(v);

/** The owner passes every role check, like public.has_role(). With no list, any admin passes. */
export function roleAllowed(role: AdminRole, allowed?: readonly AdminRole[]): boolean {
  if (!allowed) return true;
  return role === "owner" || allowed.includes(role);
}
