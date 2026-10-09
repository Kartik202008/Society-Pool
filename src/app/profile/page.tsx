"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  Calendar,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  Home,
  Building2,
  ShieldCheck,
  Sparkles,
  Wallet,
  CheckCircle2,
  PhoneCall,
  MessageCircle,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface UserProfile {
  name: string;
  fullName: string;
  flatNumber: string;
  society: string;
  email: string;
  totalSavings: number;
}

export default function ProfilePage() {
  const router = useRouter();

  // User profile state initialized with requested default values
  const [profile, setProfile] = React.useState<UserProfile>({
    name: "Rahul",
    fullName: "Rahul Sharma",
    flatNumber: "B-402",
    society: "Palm Meadows",
    email: "rahul.sharma@example.com",
    totalSavings: 1200,
  });

  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [activeModal, setActiveModal] = React.useState<
    "payments" | "notifications" | "support" | null
  >(null);

  // Notification toggles state
  const [notifications, setNotifications] = React.useState({
    whatsapp: true,
    priceDrops: true,
    bookingReminders: true,
    newPools: false,
  });

  // Fetch current logged-in user from Supabase auth if present
  React.useEffect(() => {
    async function loadUser() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: dbProfile } = await supabase
            .from("users")
            .select("*, societies(id, name)")
            .eq("id", user.id)
            .single();

          const fullName =
            dbProfile?.name ||
            user.user_metadata?.name ||
            "Rahul Sharma";
          const flatNumber =
            dbProfile?.flat_no ||
            user.user_metadata?.flat_no ||
            "B-402";
          const society =
            (dbProfile?.societies as unknown as { name?: string })?.name ||
            (user.user_metadata?.society_name as string) ||
            "Palm Meadows";

          setProfile((prev) => ({
            ...prev,
            name: fullName.split(" ")[0] || "Rahul",
            fullName,
            flatNumber,
            society,
            email: user.email || prev.email,
          }));
        }
      } catch (err) {
        console.warn("Could not load user profile from auth:", err);
      }
    }

    loadUser();
  }, []);

  // Logout handler: call supabase.auth.signOut(), toast, window.location.href = '/login'
  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      const supabase = createClient();
      await supabase.auth.signOut();

      // Clear demo session cookie if set
      document.cookie = "demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0";

      toast.success("Logged out successfully");
      window.location.href = "/login";
    } catch (err: unknown) {
      console.error("Logout error:", err);
      document.cookie = "demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0";
      toast.error("Failed to sign out cleanly. Redirecting to login...");
      window.location.href = "/login";
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Helper to extract initials for avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#F8F6EE] text-[#2E3A2F] flex flex-col justify-between selection:bg-[#C96F4F]/20 pb-28 sm:pb-24">
      {/* Top ambient earthy accent gradient bar */}
      <div className="h-1.5 w-full gradient-earthy sticky top-0 z-50" />

      {/* Header bar */}
      <header className="sticky top-1.5 z-40 bg-[#F8F6EE]/95 backdrop-blur-md border-b border-[#D9C9B2]/70 px-4 sm:px-6 py-3.5 transition-all">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <h1 className="text-xl font-heading font-bold text-[#2E3A2F] tracking-tight">
            User Profile
          </h1>
          <Badge
            variant="outline"
            className="border-[#6B7F5B] bg-[#6B7F5B]/10 text-[#6B7F5B] text-xs font-semibold px-2.5 py-0.5 rounded-full"
          >
            Verified Resident
          </Badge>
        </div>
      </header>

      {/* Main Content: Responsive Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* ========================================================================= */}
        {/* 1. HEADER: User avatar (Deep Green), name, flat number, society name     */}
        {/* ========================================================================= */}
        <section aria-labelledby="profile-header-heading">
          <Card className="card-earthy border-[#D9C9B2] bg-white overflow-hidden shadow-xs relative">
            <div className="h-1.5 w-full gradient-earthy" />
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-4">
                {/* User avatar with Deep Green background (#2E3A2F) and initials */}
                <Avatar className="size-16 sm:size-20 border-2 border-[#D9C9B2] bg-[#2E3A2F] text-[#F8F6EE] shadow-sm shrink-0">
                  <AvatarFallback className="bg-[#2E3A2F] text-[#F8F6EE] font-heading font-bold text-xl sm:text-2xl">
                    {getInitials(profile.fullName)}
                  </AvatarFallback>
                </Avatar>

                {/* Name, Flat Number, and Society Name */}
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2
                      id="profile-header-heading"
                      className="text-xl sm:text-2xl font-heading font-bold text-[#2E3A2F] truncate"
                    >
                      {profile.fullName}
                    </h2>
                    <Badge className="bg-[#2E3A2F] text-[#F8F6EE] text-[10px] font-bold px-2 py-0.5 rounded-md border-none">
                      Resident
                    </Badge>
                  </div>

                  {/* Flat Number */}
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-[#C96F4F]">
                    <Home className="size-4 shrink-0 text-[#C96F4F]" />
                    <span>Flat {profile.flatNumber}</span>
                  </div>

                  {/* Society Name */}
                  <div className="flex items-center gap-1.5 text-xs text-[#2E3A2F]/75">
                    <Building2 className="size-3.5 shrink-0 text-[#6B7F5B]" />
                    <span className="truncate font-medium">{profile.society}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ========================================================================= */}
        {/* 2. SAVINGS CARD: Soft card showing 'Your Total Savings: ₹1,200'           */}
        {/* ========================================================================= */}
        <section aria-labelledby="savings-card-heading">
          <Card className="card-earthy border-[#D9C9B2] bg-white p-5 sm:p-6 shadow-xs relative overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#6B7F5B] via-[#C96F4F] to-[#2E3A2F] absolute top-0 left-0 right-0" />
            <CardContent className="space-y-3 p-0 pt-1">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-[#6B7F5B] uppercase tracking-wider block">
                    Community Buying Impact
                  </span>
                  <h3
                    id="savings-card-heading"
                    className="text-xl sm:text-2xl font-heading font-extrabold text-[#2E3A2F]"
                  >
                    Lifetime Savings:{" "}
                    <span className="text-[#6B7F5B]">
                      ₹{profile.totalSavings.toLocaleString("en-IN")}
                    </span>
                  </h3>
                  <p className="text-xs text-[#2E3A2F]/70">
                    ₹350 saved this month • Unlocked through bulk booking pools in {profile.society}
                  </p>
                </div>

                {/* TrendingUp icon container */}
                <div className="size-12 rounded-2xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#6B7F5B] shadow-2xs shrink-0">
                  <TrendingUp className="size-6 text-[#6B7F5B]" />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ========================================================================= */}
        {/* 3. STATS ROW: Three small cards ('Active Bookings: 2', 'Completed: 5',    */}
        {/*    'Requests: 1')                                                         */}
        {/* ========================================================================= */}
        <section aria-labelledby="stats-row-heading">
          <h3 id="stats-row-heading" className="sr-only">
            Booking Statistics
          </h3>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {/* Card 1: Active Bookings: 2 */}
            <Card className="card-earthy border-[#D9C9B2] bg-white p-3 sm:p-4 text-center shadow-xs">
              <CardContent className="p-0 space-y-1">
                <span className="text-[10px] sm:text-[11px] font-semibold text-[#2E3A2F]/70 uppercase tracking-tight block">
                  Active Bookings
                </span>
                <div className="text-xl sm:text-2xl font-heading font-extrabold text-[#C96F4F]">
                  2
                </div>
                <span className="text-[10px] text-[#C96F4F] font-semibold block">
                  In Progress
                </span>
              </CardContent>
            </Card>

            {/* Card 2: Completed: 5 */}
            <Card className="card-earthy border-[#D9C9B2] bg-white p-3 sm:p-4 text-center shadow-xs">
              <CardContent className="p-0 space-y-1">
                <span className="text-[10px] sm:text-[11px] font-semibold text-[#2E3A2F]/70 uppercase tracking-tight block">
                  Completed
                </span>
                <div className="text-xl sm:text-2xl font-heading font-extrabold text-[#6B7F5B]">
                  5
                </div>
                <span className="text-[10px] text-[#6B7F5B] font-semibold block">
                  Fulfilled
                </span>
              </CardContent>
            </Card>

            {/* Card 3: Requests: 1 */}
            <Card className="card-earthy border-[#D9C9B2] bg-white p-3 sm:p-4 text-center shadow-xs">
              <CardContent className="p-0 space-y-1">
                <span className="text-[10px] sm:text-[11px] font-semibold text-[#2E3A2F]/70 uppercase tracking-tight block">
                  Requests
                </span>
                <div className="text-xl sm:text-2xl font-heading font-extrabold text-[#2E3A2F]">
                  1
                </div>
                <span className="text-[10px] text-[#2E3A2F]/60 font-semibold block">
                  Proposed
                </span>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. MENU LIST: Clickable items with Lucide icons and ChevronRight arrows   */}
        {/* ========================================================================= */}
        <section aria-labelledby="menu-list-heading">
          <Card className="card-earthy border-[#D9C9B2] bg-white divide-y divide-[#D9C9B2]/60 overflow-hidden shadow-xs">
            {/* Item 1: 'My Bookings' (Calendar icon) → links to /activity */}
            <Link
              href="/activity"
              className="flex items-center justify-between p-4 sm:p-4.5 hover:bg-[#F8F6EE] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#2E3A2F] group-hover:bg-[#C96F4F]/15 group-hover:text-[#C96F4F] transition-colors shrink-0">
                  <Calendar className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-heading font-semibold text-[#2E3A2F]">
                    My Bookings
                  </h4>
                  <p className="text-xs text-[#2E3A2F]/60">
                    View active group pools, scheduled service slots, and receipts
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-[#6B7F5B] text-[#F8F6EE] text-[10px] font-semibold px-2 py-0.5 rounded-full border-none">
                  2 Active
                </Badge>
                <ChevronRight className="size-4 text-[#2E3A2F]/40 group-hover:text-[#2E3A2F] transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>

            {/* Item 2: 'Payment Methods' (CreditCard icon) */}
            <button
              type="button"
              onClick={() => setActiveModal("payments")}
              className="w-full text-left flex items-center justify-between p-4 sm:p-4.5 hover:bg-[#F8F6EE] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#2E3A2F] group-hover:bg-[#C96F4F]/15 group-hover:text-[#C96F4F] transition-colors shrink-0">
                  <CreditCard className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-heading font-semibold text-[#2E3A2F]">
                    Payment Methods
                  </h4>
                  <p className="text-xs text-[#2E3A2F]/60">
                    UPI Auto-Pay, Society Escrow, and linked payment options
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#6B7F5B] hidden sm:inline">
                  UPI Linked
                </span>
                <ChevronRight className="size-4 text-[#2E3A2F]/40 group-hover:text-[#2E3A2F] transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>

            {/* Item 3: 'Notifications' (Bell icon) */}
            <button
              type="button"
              onClick={() => setActiveModal("notifications")}
              className="w-full text-left flex items-center justify-between p-4 sm:p-4.5 hover:bg-[#F8F6EE] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#2E3A2F] group-hover:bg-[#C96F4F]/15 group-hover:text-[#C96F4F] transition-colors shrink-0">
                  <Bell className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-heading font-semibold text-[#2E3A2F]">
                    Notifications
                  </h4>
                  <p className="text-xs text-[#2E3A2F]/60">
                    WhatsApp price drop alerts and service booking reminders
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#6B7F5B]" />
                <ChevronRight className="size-4 text-[#2E3A2F]/40 group-hover:text-[#2E3A2F] transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>

            {/* Item 4: 'Help & Support' (HelpCircle icon) */}
            <button
              type="button"
              onClick={() => setActiveModal("support")}
              className="w-full text-left flex items-center justify-between p-4 sm:p-4.5 hover:bg-[#F8F6EE] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#2E3A2F] group-hover:bg-[#C96F4F]/15 group-hover:text-[#C96F4F] transition-colors shrink-0">
                  <HelpCircle className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-heading font-semibold text-[#2E3A2F]">
                    Help & Support
                  </h4>
                  <p className="text-xs text-[#2E3A2F]/60">
                    Contact Society Management Committee & booking concierge
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ChevronRight className="size-4 text-[#2E3A2F]/40 group-hover:text-[#2E3A2F] transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          </Card>
        </section>

        {/* ========================================================================= */}
        {/* 5. LOGOUT BUTTON: Prominent button in Terracotta color with LogOut icon   */}
        {/* ========================================================================= */}
        <section aria-labelledby="logout-section">
          <Button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold text-sm sm:text-base py-3.5 sm:py-4 rounded-xl shadow-xs transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="size-4.5 animate-spin" />
                <span>Signing Out...</span>
              </>
            ) : (
              <>
                <LogOut className="size-4.5 text-[#F8F6EE]" />
                <span>Logout</span>
              </>
            )}
          </Button>

          <p className="text-center text-[11px] text-[#2E3A2F]/50 pt-2">
            SocietyPool v1.0 • Verified {profile.society} Resident
          </p>
        </section>
      </main>

      {/* Modal 1: Payment Methods */}
      <Dialog
        open={activeModal === "payments"}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <DialogContent className="sm:max-w-md bg-white border-[#D9C9B2] text-[#2E3A2F]">
          <DialogHeader>
            <DialogTitle className="font-heading font-bold text-lg text-[#2E3A2F] flex items-center gap-2">
              <CreditCard className="size-5 text-[#C96F4F]" />
              <span>Payment Methods</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#2E3A2F]/70">
              Manage saved payment options and Society Escrow for automated bulk savings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Society Wallet */}
            <div className="p-3.5 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-[#6B7F5B] text-white flex items-center justify-center">
                  <Wallet className="size-4" />
                </div>
                <div>
                  <span className="text-xs font-semibold block text-[#2E3A2F]">
                    Society Escrow Balance
                  </span>
                  <span className="text-[11px] text-[#2E3A2F]/60">
                    Instant refund credits when price drops
                  </span>
                </div>
              </div>
              <span className="text-sm font-bold text-[#6B7F5B]">₹450.00</span>
            </div>

            {/* UPI Option */}
            <div className="p-3.5 rounded-xl bg-white border border-[#D9C9B2] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-[#E8E3D6] text-[#2E3A2F] flex items-center justify-center font-bold text-xs">
                  UPI
                </div>
                <div>
                  <span className="text-xs font-semibold block text-[#2E3A2F]">
                    rahul.sharma@okhdfcbank
                  </span>
                  <span className="text-[11px] text-[#6B7F5B] font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Linked for Instant Auto-Pay
                  </span>
                </div>
              </div>
              <Badge variant="outline" className="border-[#D9C9B2] text-[10px]">
                Primary
              </Badge>
            </div>
          </div>

          <Button
            onClick={() => {
              toast.success("Payment preferences updated");
              setActiveModal(null);
            }}
            className="w-full bg-[#2E3A2F] hover:bg-[#1f2820] text-[#F8F6EE] rounded-xl text-xs py-2.5 cursor-pointer font-semibold"
          >
            Done
          </Button>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Notifications */}
      <Dialog
        open={activeModal === "notifications"}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <DialogContent className="sm:max-w-md bg-white border-[#D9C9B2] text-[#2E3A2F]">
          <DialogHeader>
            <DialogTitle className="font-heading font-bold text-lg text-[#2E3A2F] flex items-center gap-2">
              <Bell className="size-5 text-[#C96F4F]" />
              <span>Notification Preferences</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#2E3A2F]/70">
              Customize alerts for group pools and discount unlocks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2">
            {[
              {
                id: "whatsapp",
                title: "WhatsApp Price Drops",
                desc: "Instant alert when neighbor joins unlock cheaper tiers",
                checked: notifications.whatsapp,
              },
              {
                id: "priceDrops",
                title: "Booking Confirmations",
                desc: "Slot reminder sent 2 hours before vendor arrival",
                checked: notifications.priceDrops,
              },
              {
                id: "newPools",
                title: "New Society Pools",
                desc: "When neighbors create new service pools in Palm Meadows",
                checked: notifications.newPools,
              },
            ].map((item) => (
              <div
                key={item.id}
                onClick={() =>
                  setNotifications((prev) => ({
                    ...prev,
                    [item.id]: !prev[item.id as keyof typeof prev],
                  }))
                }
                className="p-3 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/70 flex items-center justify-between cursor-pointer hover:bg-[#E8E3D6]/50 transition-colors"
              >
                <div className="pr-2">
                  <span className="text-xs font-semibold block text-[#2E3A2F]">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-[#2E3A2F]/60">{item.desc}</span>
                </div>
                <div
                  className={`size-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                    item.checked
                      ? "bg-[#6B7F5B] border-[#6B7F5B] text-white"
                      : "border-[#D9C9B2] bg-white"
                  }`}
                >
                  {item.checked && (
                    <CheckCircle2 className="size-3.5 fill-white text-[#6B7F5B]" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={() => {
              toast.success("Notification preferences saved");
              setActiveModal(null);
            }}
            className="w-full bg-[#2E3A2F] hover:bg-[#1f2820] text-[#F8F6EE] rounded-xl text-xs py-2.5 cursor-pointer font-semibold"
          >
            Save Preferences
          </Button>
        </DialogContent>
      </Dialog>

      {/* Modal 3: Help & Support */}
      <Dialog
        open={activeModal === "support"}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <DialogContent className="sm:max-w-md bg-white border-[#D9C9B2] text-[#2E3A2F]">
          <DialogHeader>
            <DialogTitle className="font-heading font-bold text-lg text-[#2E3A2F] flex items-center gap-2">
              <HelpCircle className="size-5 text-[#C96F4F]" />
              <span>Society Support & Concierge</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#2E3A2F]/70">
              Need assistance with group bookings or vendor scheduling?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3.5 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2] space-y-1">
              <span className="text-[10px] uppercase font-bold text-[#6B7F5B] block">
                Resident Management Committee
              </span>
              <p className="font-semibold text-sm text-[#2E3A2F]">
                Palm Meadows Management Office
              </p>
              <p className="text-[#2E3A2F]/70 text-[11px]">
                Clubhouse Ground Floor • Mon - Sat 9:00 AM - 6:00 PM
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                href="https://wa.me/919876543210?text=Hi%2C%20I%20need%20help%20with%20my%20SocietyPool%20booking"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#2E3A2F] flex flex-col items-center justify-center text-center gap-1.5 transition-colors cursor-pointer"
              >
                <MessageCircle className="size-5 text-[#25D366]" />
                <span className="font-semibold text-xs">WhatsApp Help</span>
              </a>

              <a
                href="tel:+919876543210"
                className="p-3 rounded-xl bg-[#E8E3D6] hover:bg-[#D9C9B2] border border-[#D9C9B2] text-[#2E3A2F] flex flex-col items-center justify-center text-center gap-1.5 transition-colors cursor-pointer"
              >
                <PhoneCall className="size-5 text-[#C96F4F]" />
                <span className="font-semibold text-xs">Call Secretary</span>
              </a>
            </div>
          </div>

          <Button
            onClick={() => setActiveModal(null)}
            className="w-full bg-[#2E3A2F] hover:bg-[#1f2820] text-[#F8F6EE] rounded-xl text-xs py-2.5 cursor-pointer font-semibold"
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
