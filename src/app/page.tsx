import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

// Allow dynamic blocking redirect for root routing in Next.js 16
export const instant = false;

/**
 * Root page acts as a session router:
 * - If unauthenticated -> redirects to /login
 * - If admin -> redirects to /admin
 * - If resident -> redirects to /dashboard
 */
export default async function RootPage() {
  await connection();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const demoRole = cookieStore.get("demo_role")?.value;

  if (user) {
    redirect("/dashboard");
  }

  // Fallback to demoRole only when no authenticated user session exists
  if (demoRole === "admin") {
    redirect("/admin");
  } else if (demoRole === "resident") {
    redirect("/dashboard");
  }

  redirect("/login");
}
