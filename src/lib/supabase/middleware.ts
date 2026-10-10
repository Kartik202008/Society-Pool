import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getUserRole } from "@/lib/auth";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Calling getUser refreshes the auth session token if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const demoRole = request.cookies.get("demo_role")?.value;

  // Determine effective user role using single source of truth (public.users)
  const effectiveRole = await getUserRole(supabase, user, demoRole);

  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/activity") ||
    pathname.startsWith("/copilot") ||
    pathname.startsWith("/event");

  // Helper to build redirect responses while preserving any refreshed Supabase cookies
  const createRedirect = (targetPath: string) => {
    const url = request.nextUrl.clone();
    url.pathname = targetPath;
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  };

  // Protect routes: If not authenticated and no demo role, redirect to /login
  if (!user && !demoRole && isProtectedRoute) {
    return createRedirect("/login");
  }

  // Resident role cannot access /admin
  if (effectiveRole === "resident" && pathname.startsWith("/admin")) {
    return createRedirect("/dashboard?error=access_restricted");
  }

  // If already authenticated and navigating to /login, redirect to /dashboard
  // (unless user is arriving with an error message to display)
  if ((user || demoRole) && pathname === "/login" && !request.nextUrl.searchParams.has("error")) {
    return createRedirect("/dashboard");
  }

  return supabaseResponse;
}
