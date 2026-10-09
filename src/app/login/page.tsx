"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Building2, ShieldCheck, Mail, Lock, User, Home } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { getUserRole } from "@/lib/auth";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  // Form states
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [societyName, setSocietyName] = React.useState("");
  const [flatNumber, setFlatNumber] = React.useState("");
  const [accountType, setAccountType] = React.useState<"resident" | "admin">("resident");
  const [inviteCode, setInviteCode] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      toast.error("Please enter both email and password.");
      return;
    }

    if (isSignUp) {
      if (!fullName.trim()) {
        toast.error("Please enter your full name.");
        return;
      }
      if (!societyName.trim()) {
        toast.error("Please enter your housing society name.");
        return;
      }
      if (!flatNumber.trim()) {
        toast.error("Please enter your flat or unit number.");
        return;
      }

      // Validate Admin Invite Code if signing up as Society Admin
      if (accountType === "admin") {
        const cleanCode = inviteCode.trim().toUpperCase();
        const validCodes = [
          "ADMIN2026",
          "SOCIETY_ADMIN_2026",
          "GREENWOOD_ADMIN",
          process.env.NEXT_PUBLIC_ADMIN_INVITE_CODE?.toUpperCase(),
        ].filter(Boolean) as string[];

        if (!cleanCode || !validCodes.includes(cleanCode)) {
          toast.error("Invalid admin invite code");
          return;
        }
      }
    }

    setIsLoading(true);
    // Clear any stale demo role cookie so real authentication controls session
    document.cookie = "demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0";
    const supabase = createClient();

    try {
      if (isSignUp) {
        // Sign Up flow
        const assignedRole = accountType === "admin" ? "admin" : "resident";
        const cleanSociety = societyName.trim();

        // 1. Sync or retrieve society record
        let societyId: string | null = null;
        try {
          const { data: existingSoc } = await supabase
            .from("societies")
            .select("id")
            .ilike("name", cleanSociety)
            .limit(1)
            .maybeSingle();

          if (existingSoc?.id) {
            societyId = existingSoc.id;
          } else {
            const { data: newSoc } = await supabase
              .from("societies")
              .insert({ name: cleanSociety })
              .select("id")
              .single();
            if (newSoc?.id) societyId = newSoc.id;
          }
        } catch (socErr) {
          console.warn("Societies table sync notice:", socErr);
        }

        // 2. Register user with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              name: fullName.trim(),
              society_name: cleanSociety,
              flat_no: flatNumber.trim(),
              role: assignedRole,
            },
          },
        });

        if (error) {
          console.error("Supabase signUp error details:", {
            message: error.message,
            code: error.code,
            status: error.status,
          });
          toast.error(error.message || "Failed to create account.");
          return;
        }

        // 3. Upsert profile row in public.users (single source of truth for role)
        if (data.user) {
          try {
            await supabase.from("users").upsert({
              id: data.user.id,
              name: fullName.trim(),
              flat_no: flatNumber.trim(),
              society_id: societyId,
              role: assignedRole,
            });
          } catch (profileErr) {
            console.warn("Could not upsert profile into public.users:", profileErr);
          }
        }

        if (data.session) {
          document.cookie = `demo_role=${assignedRole}; path=/; max-age=86400; SameSite=Lax`;
          toast.success("Account created! Welcome to SocietyPool.");
          window.location.href = "/dashboard";
        } else if (data.user) {
          toast.success("Account created! Please sign in with your email and password.");
          setIsSignUp(false);
        }
      } else {
        // Sign In flow
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          console.error("Supabase signIn error details:", {
            message: error.message,
            code: error.code,
            status: error.status,
          });
          toast.error(error.message || "Invalid email or password.");
          return;
        }

        // Verify session exists before redirecting to avoid bouncing
        if (!data.session) {
          console.error("Supabase signIn succeeded but no session was returned:", {
            user: data.user,
            session: data.session,
          });
          toast.error("No active session established. Please verify your credentials.");
          return;
        }

        if (data.user) {
          const role = await getUserRole(supabase, data.user, null);
          document.cookie = `demo_role=${role}; path=/; max-age=86400; SameSite=Lax`;
          const target = "/dashboard";
          toast.success("Welcome back!");
          window.location.href = target;
        }
      }
    } catch (err: unknown) {
      const error = err as { message?: string; code?: string; status?: number };
      console.error("Auth error details:", {
        message: error?.message,
        code: error?.code,
        status: error?.status,
      });
      toast.error(error?.message || "Authentication error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemo = (role: "admin" | "resident") => {
    document.cookie = `demo_role=${role}; path=/; max-age=86400`;
    toast.success(`Demo Access: Entering as ${role === "admin" ? "Society Secretary" : "Resident"}`);
    window.location.href = role === "admin" ? "/admin" : "/dashboard";
  };

  const handleGoogleSignIn = () => {
    toast.info("Google Sign-In is coming soon!", {
      description: "Please sign in using email, or click quick demo access below.",
    });
  };

  return (
    <div className="min-h-screen bg-[#F8F6EE] text-[#2E3A2F] flex flex-col justify-between relative overflow-hidden">
      {/* Top ambient earthy accent gradient bar */}
      <div className="h-1.5 w-full gradient-earthy z-10" />

      {/* Subtle residential building background overlay for login hero atmosphere */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-25 hero-residential-bg" 
        style={{
          backgroundPosition: "center 20%",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%)"
        }}
      />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 relative z-10">
        <div className="w-full max-w-md space-y-6">
          {/* Brand Logo & Tagline */}
          <div className="text-center space-y-2">
            <div className="inline-flex size-14 rounded-2xl bg-[#E8E3D6] border border-[#D9C9B2] items-center justify-center text-[#C96F4F] shadow-xs">
              <Building2 className="size-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-heading font-bold tracking-tight text-[#2E3A2F] flex items-center justify-center gap-1.5">
                <span>SocietyPool</span>
                <Sparkles className="size-5 text-[#C96F4F]" />
              </h1>
              <p className="text-xs sm:text-sm text-[#2E3A2F]/70 font-medium max-w-xs mx-auto">
                Group-buying home services for housing societies
              </p>
            </div>
          </div>

          {/* Login / Sign Up Card */}
          <Card className="card-earthy border-[#D9C9B2] bg-white shadow-sm overflow-hidden rounded-2xl">
            <CardHeader className="space-y-1.5 pb-4 pt-6 px-6 text-center">
              <CardTitle className="text-xl font-heading font-semibold text-[#2E3A2F]">
                {isSignUp ? "Create an Account" : "Sign In to Your Society"}
              </CardTitle>
              <CardDescription className="text-xs text-[#2E3A2F]/70">
                {isSignUp
                  ? "Join your neighbors and unlock wholesale group rates"
                  : "Enter your credentials to access active group bookings"}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 pb-6 pt-0 space-y-4">
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {isSignUp && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="fullName"
                      className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5"
                    >
                      <User className="size-3.5 text-[#6B7F5B]" />
                      Full Name
                    </Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="e.g. Kartik Goyal"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={isSignUp}
                      className="bg-[#F8F6EE]/60 border-[#D9C9B2] focus-visible:ring-[#C96F4F] text-[#2E3A2F] rounded-xl text-sm"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5"
                  >
                    <Mail className="size-3.5 text-[#6B7F5B]" />
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@societypool.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="bg-[#F8F6EE]/60 border-[#D9C9B2] focus-visible:ring-[#C96F4F] text-[#2E3A2F] rounded-xl text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="password"
                      className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5"
                    >
                      <Lock className="size-3.5 text-[#6B7F5B]" />
                      Password
                    </Label>
                    {!isSignUp && (
                      <span className="text-[11px] text-[#6B7F5B] hover:text-[#2E3A2F] cursor-pointer">
                        Forgot password?
                      </span>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    className="bg-[#F8F6EE]/60 border-[#D9C9B2] focus-visible:ring-[#C96F4F] text-[#2E3A2F] rounded-xl text-sm"
                  />
                </div>

                {isSignUp && (
                  <>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="societyName"
                        className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5"
                      >
                        <Building2 className="size-3.5 text-[#6B7F5B]" />
                        Society Name
                      </Label>
                      <Input
                        id="societyName"
                        type="text"
                        placeholder="e.g. Palm Meadows"
                        value={societyName}
                        onChange={(e) => setSocietyName(e.target.value)}
                        required={isSignUp}
                        className="bg-[#F8F6EE]/60 border-[#D9C9B2] focus-visible:ring-[#C96F4F] text-[#2E3A2F] rounded-xl text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="flatNumber"
                        className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5"
                      >
                        <Home className="size-3.5 text-[#6B7F5B]" />
                        Flat Number
                      </Label>
                      <Input
                        id="flatNumber"
                        type="text"
                        placeholder="e.g. B-234"
                        value={flatNumber}
                        onChange={(e) => setFlatNumber(e.target.value)}
                        required={isSignUp}
                        className="bg-[#F8F6EE]/60 border-[#D9C9B2] focus-visible:ring-[#C96F4F] text-[#2E3A2F] rounded-xl text-sm"
                      />
                    </div>

                    {/* Account Type Selector (Resident vs Society Admin) */}
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-xs font-semibold text-[#2E3A2F]">Account Type</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAccountType("resident")}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                            accountType === "resident"
                              ? "bg-[#2E3A2F] text-[#F8F6EE] border-[#2E3A2F] shadow-xs"
                              : "bg-[#F8F6EE]/60 text-[#2E3A2F]/80 border-[#D9C9B2] hover:bg-[#E8E3D6]"
                          }`}
                        >
                          <span
                            className={`size-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                              accountType === "resident" ? "border-white bg-[#C96F4F]" : "border-[#D9C9B2]"
                            }`}
                          >
                            {accountType === "resident" && <span className="size-1.5 rounded-full bg-white" />}
                          </span>
                          <span>Resident</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAccountType("admin")}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                            accountType === "admin"
                              ? "bg-[#2E3A2F] text-[#F8F6EE] border-[#2E3A2F] shadow-xs"
                              : "bg-[#F8F6EE]/60 text-[#2E3A2F]/80 border-[#D9C9B2] hover:bg-[#E8E3D6]"
                          }`}
                        >
                          <span
                            className={`size-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                              accountType === "admin" ? "border-white bg-[#C96F4F]" : "border-[#D9C9B2]"
                            }`}
                          >
                            {accountType === "admin" && <span className="size-1.5 rounded-full bg-white" />}
                          </span>
                          <span>Society Admin</span>
                        </button>
                      </div>
                    </div>

                    {/* Admin Invite Code (Only shown when Society Admin is selected) */}
                    {accountType === "admin" && (
                      <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="inviteCode"
                            className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5"
                          >
                            <ShieldCheck className="size-3.5 text-[#C96F4F]" />
                            Admin Invite Code
                          </Label>
                          <span className="text-[10px] text-[#6B7F5B] font-medium">Demo: ADMIN2026</span>
                        </div>
                        <Input
                          id="inviteCode"
                          type="text"
                          placeholder="e.g. ADMIN2026"
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value)}
                          required={isSignUp && accountType === "admin"}
                          className="bg-[#F8F6EE]/60 border-[#D9C9B2] focus-visible:ring-[#C96F4F] text-[#2E3A2F] rounded-xl text-sm uppercase tracking-wider"
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Submit Button (Terracotta Accent) */}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold py-2.5 rounded-xl transition-all shadow-xs active:scale-[0.99] mt-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      {isSignUp ? "Creating Account..." : "Signing In..."}
                    </>
                  ) : isSignUp ? (
                    "Create Account"
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

              {/* Or separator */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#D9C9B2]/70" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                  <span className="bg-white px-3 text-[#2E3A2F]/60 font-semibold">
                    Or continue with
                  </span>
                </div>
              </div>

              {/* Continue with Google button */}
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                className="w-full border-[#D9C9B2] bg-[#F8F6EE]/50 hover:bg-[#E8E3D6]/50 text-[#2E3A2F] font-semibold rounded-xl py-2.5 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="size-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </Button>

              {/* Quick Demo Access Buttons for Hackathon Evaluation */}
              <div className="pt-2 border-t border-[#E8E3D6]/80 space-y-2">
                <span className="text-[11px] font-semibold text-[#2E3A2F]/60 uppercase tracking-wider block text-center">
                  Quick Demo Access
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    onClick={() => handleQuickDemo("admin")}
                    className="bg-[#2E3A2F] hover:bg-[#222b23] text-[#F8F6EE] font-medium text-xs rounded-xl py-2 cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="size-3.5 text-[#C96F4F]" />
                    <span>Secretary (Admin)</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleQuickDemo("resident")}
                    className="bg-[#6B7F5B] hover:bg-[#5b6d4d] text-[#F8F6EE] font-medium text-xs rounded-xl py-2 cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <User className="size-3.5" />
                    <span>Resident (Rahul)</span>
                  </Button>
                </div>
              </div>

              {/* Sign Up / Sign In Toggle */}
              <div className="pt-2 text-center text-xs text-[#2E3A2F]/75">
                {isSignUp ? (
                  <span>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setIsSignUp(false)}
                      className="font-semibold text-[#C96F4F] hover:underline"
                    >
                      Sign in
                    </button>
                  </span>
                ) : (
                  <span>
                    New to your society?{" "}
                    <button
                      type="button"
                      onClick={() => setIsSignUp(true)}
                      className="font-semibold text-[#C96F4F] hover:underline"
                    >
                      Create an account
                    </button>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Society Trust Footer */}
      <footer className="py-4 text-center text-xs text-[#2E3A2F]/60 flex items-center justify-center gap-1.5">
        <ShieldCheck className="size-4 text-[#6B7F5B]" />
        <span>SocietyPool • Secure housing society portal</span>
      </footer>
    </div>
  );
}
