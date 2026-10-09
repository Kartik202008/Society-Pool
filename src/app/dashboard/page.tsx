import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import {
  TrendingUp,
  ShieldCheck,
  Sparkles,
  Star,
  HelpCircle,
  CalendarX2,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeaderActions } from "@/components/dashboard/header-actions";
import { EventRealtime } from "@/components/EventRealtime";
import { RequestServiceDialog } from "@/components/RequestServiceDialog";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { getUserRole } from "@/lib/auth";
import {
  parsePriceTiers,
  calculateEventPricing,
  formatSlotTime,
} from "@/lib/pricing";
import { ScrollAtmosphere } from "@/components/dashboard/scroll-atmosphere";
import type { Event, DatabaseEventRow } from "@/types";

// Allow dynamic blocking route for resident dashboard in Next.js 16
export const instant = false;

// User profile context (can be dynamic or session-backed)
const CURRENT_USER = {
  name: "Rahul",
  fullName: "Rahul Sharma",
  flatNumber: "B-402",
  society: "Palm Meadows",
  savingsThisMonth: 350,
  lifetimeSavings: 1200,
  avatarUrl: "",
};

interface EventWithPricing extends Event {
  calculatedCurrentPrice: number;
  calculatedOriginalPrice?: number;
  nextTierPrice?: number;
  nextTierNeeded?: number;
  progressText: string;
  calculatedTargetCount: number;
  progressPercent: number;
  formattedSlotTime: string;
}

// Async component to fetch and render events from Supabase
async function ActiveEventsList() {
  await connection();
  const supabase = await createClient();

  // 1. Fetch all events from events table where status = 'open', ordered by created_at descending
  const { data: rawEvents, error: eventsError } = await supabase
    .from("events")
    .select("*, participants(id)")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (eventsError) {
    console.error("Error fetching events from Supabase:", eventsError);
  }

  const eventList: DatabaseEventRow[] =
    (rawEvents as unknown as DatabaseEventRow[]) ?? [];

  // 2. Map events and calculate pricing
  const events: EventWithPricing[] = eventList.map((row) => {
    // Calculate participant count using row.participants.length, handling null or empty
    const participantCount =
      row.participants && Array.isArray(row.participants)
        ? row.participants.length
        : 0;

    const parsedTiers = parsePriceTiers(row.price_tiers);
    const pricing = calculateEventPricing(
      participantCount,
      parsedTiers,
      row.min_participants,
      row.max_participants
    );

    const target = pricing.targetCount;
    const progressPercent = Math.min(
      100,
      target > 0 ? Math.max(0, Math.round((participantCount / target) * 100)) : 0
    );

    return {
      id: row.id,
      title: row.title,
      description: row.service_type || "",
      serviceCategory: row.service_type || "Home Service",
      societyId: row.society_id || "",
      vendorName: row.vendor_name,
      status: row.status,
      slotTime: row.slot_time,
      targetFlats: target,
      currentParticipants: participantCount,
      basePrice: pricing.basePrice,
      currentPrice: pricing.currentPrice,
      priceTiers: parsedTiers,
      createdAt: row.created_at,
      calculatedCurrentPrice: pricing.currentPrice,
      calculatedOriginalPrice: pricing.originalPrice,
      nextTierPrice: pricing.nextTierPrice,
      nextTierNeeded: pricing.nextTierNeeded,
      progressText: pricing.progressText,
      calculatedTargetCount: target,
      progressPercent,
      formattedSlotTime: formatSlotTime(row.slot_time),
    };
  });

  if (events.length === 0) {
    return (
      <Card className="card-earthy border-[#D9C9B2] bg-white p-6 sm:p-8 text-center shadow-xs">
        <CardContent className="flex flex-col items-center justify-center space-y-4 p-2 sm:p-4">
          <div className="size-14 rounded-2xl bg-[#E8E3D6]/70 border border-[#D9C9B2] flex items-center justify-center text-[#6B7F5B]">
            <CalendarX2 className="size-7 text-[#6B7F5B]" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="font-heading font-semibold text-lg text-[#2E3A2F]">
              No Active Group Bookings
            </h3>
            <p className="text-sm text-[#2E3A2F]/80 font-medium leading-relaxed">
              No active events in your society yet. Ask your secretary to create one!
            </p>
          </div>
          <RequestServiceDialog
            societyName={CURRENT_USER.society}
            className="mt-2"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <Card
          key={event.id}
          className="card-earthy card-earthy-hover border-[#D9C9B2] bg-white overflow-hidden transition-all duration-200"
        >
          <CardContent className="p-4 sm:p-5 space-y-4">
            {/* Card Header Row: Title & Badge */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/event/${event.id}`}
                    className="hover:underline text-[#2E3A2F]"
                  >
                    <h3 className="text-base sm:text-lg font-heading font-semibold text-[#2E3A2F] hover:text-[#C96F4F] transition-colors">
                      {event.title}
                    </h3>
                  </Link>
                  <Badge
                    variant="outline"
                    className="border-[#D9C9B2] bg-[#F8F6EE] text-[#2E3A2F] text-[11px] font-medium px-2 py-0.5"
                  >
                    {event.serviceCategory}
                  </Badge>
                </div>
                <p className="text-xs text-[#2E3A2F]/70">
                  {event.vendorName
                    ? `Partner: ${event.vendorName}`
                    : "Society Verified Vendor"}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/event/${event.id}`}
                  className="hidden sm:inline-flex items-center gap-0.5 text-xs font-semibold text-[#C96F4F] hover:text-[#B85A3A] hover:underline"
                >
                  <span>Details</span>
                  <ChevronRight className="size-3.5" />
                </Link>
                <div className="flex items-center gap-1 text-xs font-semibold text-[#6B7F5B] bg-[#E8E3D6]/50 px-2 py-1 rounded-md">
                  <Star className="size-3.5 fill-[#6B7F5B] text-[#6B7F5B]" />
                  <span>4.8</span>
                </div>
              </div>
            </div>

            {/* Realtime progress bar, dynamic price & JoinButton */}
            <EventRealtime
              eventId={event.id}
              initialParticipantCount={event.currentParticipants}
              priceTiers={event.priceTiers}
              minParticipants={event.calculatedTargetCount}
              maxParticipants={event.calculatedTargetCount}
              formattedSlotTime={event.formattedSlotTime}
              status={event.status}
              unit={
                event.serviceCategory?.toLowerCase().includes("car")
                  ? "car"
                  : "flat"
              }
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EventsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Card
          key={i}
          className="card-earthy border-[#D9C9B2] bg-white p-5 animate-pulse"
        >
          <CardContent className="space-y-4 p-0">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <div className="h-5 w-40 bg-[#E8E3D6] rounded-md" />
                <div className="h-3 w-56 bg-[#E8E3D6]/60 rounded-md" />
              </div>
              <div className="h-6 w-12 bg-[#E8E3D6] rounded-md" />
            </div>
            <div className="h-16 w-full bg-[#F8F6EE] rounded-xl border border-[#D9C9B2]/60 p-3" />
            <div className="flex justify-between items-center pt-2">
              <div className="h-7 w-24 bg-[#E8E3D6] rounded-md" />
              <div className="h-9 w-28 bg-[#C96F4F]/30 rounded-xl" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function DashboardHeader() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const demoRole = cookieStore.get("demo_role")?.value;

  let currentUser = CURRENT_USER;
  const userRole = await getUserRole(supabase, user, demoRole);

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("*, societies(id, name)")
      .eq("id", user.id)
      .single();

    const name =
      profile?.name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Rahul";
    const flat = profile?.flat_no || user.user_metadata?.flat_no || "B-402";
    const society =
      (profile?.societies as unknown as { name?: string })?.name ||
      (user.user_metadata?.society_name as string) ||
      CURRENT_USER.society ||
      "Palm Meadows";

    currentUser = {
      ...CURRENT_USER,
      name: name.split(" ")[0],
      fullName: name,
      flatNumber: flat,
      society,
    };
  }

  return (
    <header className="flex items-center justify-between pb-1">
      <div className="space-y-0.5">
        <h1 className="text-2xl sm:text-3xl font-heading font-semibold tracking-tight text-[#2E3A2F]">
          Good Morning, {currentUser.name}
        </h1>
        <p className="text-xs sm:text-sm text-[#2E3A2F]/70 font-medium flex items-center gap-1.5">
          <span>{currentUser.society}</span>
          <span className="text-[#D9C9B2]">•</span>
          <span>Flat {currentUser.flatNumber}</span>
        </p>
      </div>

      <HeaderActions
        userName={currentUser.fullName}
        avatarUrl={currentUser.avatarUrl}
        societyName={currentUser.society}
        flatNumber={currentUser.flatNumber}
        userRole={userRole}
      />
    </header>
  );
}

function HeaderSkeleton() {
  return (
    <header className="flex items-center justify-between pb-1">
      <div className="space-y-1.5">
        <div className="h-7 w-48 bg-[#E8E3D6] rounded-md animate-pulse" />
        <div className="h-4 w-32 bg-[#E8E3D6]/70 rounded-md animate-pulse" />
      </div>
      <div className="size-10 rounded-full bg-[#E8E3D6] animate-pulse" />
    </header>
  );
}

export default async function ResidentDashboard() {
  await connection();
  return (
    <div className="relative min-h-screen bg-[#F8F6EE] text-[#2E3A2F]">
      {/* Isolated persistent ambient visual scenery */}
      <ScrollAtmosphere />

      <div className="relative z-10">
        {/* Top ambient earthy accent gradient bar */}
        <div className="h-1.5 w-full gradient-earthy" />

      {/* ========================================================================= */}
      {/* HERO / HEADER SECTION                                                     */}
      {/* ========================================================================= */}
      <section className="relative pt-6 pb-6 sm:pt-8 sm:pb-8">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 space-y-5">
          {/* 1. HEADER (Streamed via Suspense) */}
          <Suspense fallback={<HeaderSkeleton />}>
            <DashboardHeader />
          </Suspense>

          {/* 2. SAVINGS BANNER (Soft Card with subtle backdrop) */}
          <Card className="card-earthy border-[#D9C9B2] bg-white/95 backdrop-blur-sm shadow-xs overflow-hidden">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B7F5B] uppercase tracking-wider">
                    <TrendingUp className="size-4 text-emerald-600 shrink-0" />
                    <span>Community Benefits</span>
                  </div>
                  <div className="text-lg sm:text-xl font-heading font-bold text-[#2E3A2F]">
                    Monthly Savings:{" "}
                    <span className="text-emerald-700 font-extrabold">
                      ₹{CURRENT_USER.savingsThisMonth.toLocaleString("en-IN")}
                    </span>{" "}
                    <span className="text-xs font-medium text-[#6B7F5B]">
                      • ₹{CURRENT_USER.lifetimeSavings.toLocaleString("en-IN")} lifetime
                    </span>
                  </div>
                  <p className="text-xs text-[#2E3A2F]/70">
                    Unlocked via community group bookings with {CURRENT_USER.society} neighbors
                  </p>
                </div>

                {/* Decorative graphic token */}
                <div className="hidden sm:flex size-12 rounded-2xl bg-[#E8E3D6]/60 border border-[#D9C9B2]/70 items-center justify-center shrink-0">
                  <Sparkles className="size-6 text-[#C96F4F]" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA                                                         */}
      {/* ========================================================================= */}
      <main className="mx-auto max-w-2xl px-4 py-2 sm:px-6 sm:py-4 space-y-6">
        {/* ========================================================================= */}
        {/* 3. SECTION TITLE                                                          */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-heading font-semibold text-[#2E3A2F]">
              Active Group Bookings in Society
            </h2>
          </div>
          <span className="text-xs text-[#6B7F5B] font-medium hidden sm:inline-block">
            Group Buying Rates
          </span>
        </div>

        {/* ========================================================================= */}
        {/* 4. EVENT CARDS / EMPTY STATE (Streamed via Suspense from Supabase)        */}
        {/* ========================================================================= */}
        <Suspense fallback={<EventsLoadingSkeleton />}>
          <ActiveEventsList />
        </Suspense>

        {/* ========================================================================= */}
        {/* 5. BOTTOM ACTION: SUGGEST A SERVICE (Soft Card)                            */}
        {/* ========================================================================= */}
        <Card className="card-earthy border-[#D9C9B2] bg-white/95 backdrop-blur-sm p-1">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B7F5B] uppercase tracking-wide">
                <HelpCircle className="size-3.5 text-[#6B7F5B]" />
                <span>Need Something Else?</span>
              </div>
              <h3 className="text-base sm:text-lg font-heading font-semibold text-[#2E3A2F]">
                Can&apos;t find a service? Suggest it!
              </h3>
              <p className="text-xs text-[#2E3A2F]/75 max-w-sm">
                Propose services like Pest Control, Sofa Cleaning, or Painting. When 5+ flats join, we unlock bulk rates.
              </p>
            </div>

            <RequestServiceDialog
              societyName={CURRENT_USER.society}
              className="w-full sm:w-auto shrink-0"
            />
          </CardContent>
        </Card>

        {/* Society Trust Footer */}
        <footer className="pt-4 pb-12 text-center text-xs text-[#2E3A2F]/60 flex items-center justify-center gap-1.5">
          <ShieldCheck className="size-4 text-[#6B7F5B]" />
          <span>SocietyPool • Verified local vendors exclusively for {CURRENT_USER.society}</span>
        </footer>
      </main>
      </div>
    </div>
  );
}
