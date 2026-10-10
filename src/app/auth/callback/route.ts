import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getUserRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";
  const origin = requestUrl.origin;

  // Handle OAuth provider error (e.g., user cancellation or access_denied)
  if (error) {
    console.error("OAuth error received in callback:", { error, errorDescription });
    const message = errorDescription || error || "Google sign-in was cancelled or failed.";
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
  }

  if (code) {
    let response = NextResponse.redirect(`${origin}${next}`);

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
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Supabase exchangeCodeForSession error:", exchangeError);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          exchangeError.message || "Failed to exchange authorization code."
        )}`
      );
    }

    const user = data.user;
    if (user) {
      // Check if user profile already exists in public.users
      const { data: existingProfile } = await supabase
        .from("users")
        .select("id, role, society_id")
        .eq("id", user.id)
        .maybeSingle();

      let effectiveRole = existingProfile?.role;

      if (!existingProfile) {
        // First-time Google OAuth user: extract name and initialize profile in public.users
        const googleName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Resident";

        effectiveRole = "resident";

        try {
          await supabase.from("users").upsert({
            id: user.id,
            name: googleName.trim(),
            flat_no: null,
            society_id: null,
            role: "resident",
          });
        } catch (profileErr) {
          console.warn("Could not upsert Google OAuth profile into public.users:", profileErr);
        }
      }

      if (!effectiveRole) {
        effectiveRole = await getUserRole(supabase, user, null);
      }

      // Determine redirect target: admins go to /admin, residents go to /dashboard (or `next`)
      const targetPath = effectiveRole === "admin" ? "/admin" : next;

      // Update response redirect destination while preserving all session Set-Cookie headers
      const finalRedirect = NextResponse.redirect(`${origin}${targetPath}`, {
        headers: response.headers,
      });

      // Synchronize demo_role cookie so middleware and SSR are aligned
      finalRedirect.cookies.set("demo_role", effectiveRole, {
        path: "/",
        maxAge: 86400,
        sameSite: "lax",
      });

      return finalRedirect;
    }
  }

  // If neither code nor error was provided
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("No authorization code was provided from Google.")}`
  );
}
