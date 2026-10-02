import type { User } from "@supabase/supabase-js";

export const PLATFORM_OWNER_EMAIL = "ashraf@admin.com";
export const LIMITED_AUDIT_VIEWER_EMAIL = "hassan@admin.com";

/** UI convenience only. Supabase repeats this check for every platform mutation. */
export function isPlatformOwner(user: Pick<User, "email"> | null | undefined): boolean {
  return user?.email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;
}

/** UI hint only; audit log RLS verifies the account and its platform role. */
export function isLimitedAuditViewer(user: Pick<User, "email"> | null | undefined): boolean {
  return user?.email?.trim().toLowerCase() === LIMITED_AUDIT_VIEWER_EMAIL;
}
