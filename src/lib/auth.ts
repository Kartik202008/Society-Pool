import type { SupabaseClient, User } from "@supabase/supabase-js";

export type UserRole = "admin" | "resident";

/**
 * Single source of truth for user role detection across the entire application:
 * 1. Query public.users table (profile.role) - PRIMARY AUTHORITY
 * 2. Fallback to user.user_metadata.role if profile record is still syncing
 * 3. Fallback to demoRole cookie if in demo/preview mode without auth user
 * 4. Default to "resident"
 *
 * NOTE: As requested by system architecture, no arbitrary email-pattern
 * heuristics (such as email.includes("admin")) are used.
 */
export async function getUserRole(
  supabase: SupabaseClient,
  user: User | null,
  demoRole?: string | null
): Promise<UserRole> {
  if (user) {
    try {
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "admin") {
        return "admin";
      }
      if (profile?.role === "resident") {
        return "resident";
      }
    } catch {
      // Fall through to metadata fallback
    }

    if (user.user_metadata?.role === "admin") {
      return "admin";
    }
    if (user.user_metadata?.role === "resident") {
      return "resident";
    }

    return "resident";
  }

  if (demoRole === "admin") return "admin";
  return "resident";
}
