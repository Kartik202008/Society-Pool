"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarCheck,
  TrendingUp,
  ArrowRight,
  ArrowLeft,
  Users,
  CheckCircle2,
  Sparkles,
  Receipt,
  Calendar,
  Clock,
  Ban,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  calculateEventPricing,
  parsePriceTiers,
  formatSlotTime,
} from "@/lib/pricing";
import { toast } from "sonner";
import { format } from "date-fns";

export type BookingStatus = "Active" | "Completed" | "Cancelled";

export interface BookingItem {
  id: string; // participation id
  title: string;
  category: string;
  vendorName: string;
  status: BookingStatus;
  progressText?: string;
  progressPercent?: number;
  currentPrice?: number;
  finalPrice?: number;
  savedAmount?: number;
  savingsPercentage?: number;
  originalPrice?: number;
  dateText: string;
  joinedAtText: string;
  bookingRef: string;
  eventId?: string;
  unit: string;
  participantCount: number;
}

interface SupabaseParticipationRow {
  id: string;
  flat_no: string | null;
  joined_at: string;
  user_id: string;
  event: {
    id: string;
    title: string;
    service_type: string | null;
    vendor_name: string | null;
    slot_time: string | null;
    status: string;
    min_participants: number | null;
    max_participants: number | null;
    price_tiers: unknown;
    participants?: { id: string }[] | null;
  } | null;
}

export default function ActivityPage() {
  const [bookings, setBookings] = React.useState<BookingItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null);
  const [selectedReceipt, setSelectedReceipt] = React.useState<BookingItem | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    async function loadUserBookings() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const supabase = createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          if (isMounted) {
            setIsAuthenticated(false);
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) {
          setIsAuthenticated(true);
        }

        // Fetch authenticated user's participation records from participants joined with events
        const { data, error } = await supabase
          .from("participants")
          .select(`
            id,
            flat_no,
            joined_at,
            user_id,
            event:events (
              id,
              title,
              service_type,
              vendor_name,
              slot_time,
              status,
              min_participants,
              max_participants,
              price_tiers,
              participants:participants(id)
            )
          `)
          .eq("user_id", user.id)
          .order("joined_at", { ascending: false });

        if (error) {
          console.error("Error querying resident participations:", error);
          if (isMounted) {
            setErrorMessage("Could not load your group bookings. Please try again.");
            setIsLoading(false);
          }
          return;
        }

        const rows = (data as unknown as SupabaseParticipationRow[]) || [];

        // Map Supabase rows to BookingItem objects
        const mappedBookings: BookingItem[] = rows.map((row) => {
          const ev = row.event;
          const eventStatus = ev?.status?.toLowerCase() || "open";

          // Map booking status:
          // event.status === "open" -> Active
          // event.status === "completed" -> Completed
          // event.status === "cancelled" -> Cancelled
          let status: BookingStatus = "Active";
          if (eventStatus === "completed") {
            status = "Completed";
          } else if (eventStatus === "cancelled") {
            status = "Cancelled";
          } else {
            status = "Active";
          }

          const allEventParticipants = ev?.participants || [];
          const participantCount = Array.isArray(allEventParticipants)
            ? allEventParticipants.length
            : 0;

          const tiers = parsePriceTiers(ev?.price_tiers);
          const pricing = calculateEventPricing(
            participantCount,
            tiers,
            ev?.min_participants,
            ev?.max_participants
          );

          const target = pricing.targetCount;
          const progressPercent = Math.min(
            100,
            target > 0
              ? Math.max(0, Math.round((participantCount / target) * 100))
              : 0
          );

          // Joined date display
          let joinedAtText = "Recently";
          try {
            if (row.joined_at) {
              const d = new Date(row.joined_at);
              if (!isNaN(d.getTime())) {
                joinedAtText = format(d, "d MMM yyyy, h:mm a");
              }
            }
          } catch {
            joinedAtText = "Recently";
          }

          // Slot time or execution schedule
          const dateText = ev?.slot_time
            ? formatSlotTime(ev.slot_time)
            : "Schedule coordinated with society secretary";

          // Booking reference format
          const shortId = row.id.slice(0, 6).toUpperCase();
          const bookingRef = `SP-${shortId}`;

          const serviceCategory = ev?.service_type || "Home Service";
          const title = ev?.title || "Society Group Booking";
          const vendorName = ev?.vendor_name || "Verified Society Partner";

          // Calculate savings if original base price exists and is higher than current/final price
          const basePrice = pricing.basePrice;
          const currentPrice = pricing.currentPrice;
          const hasSavings = pricing.savingsPerResident > 0;
          const savedAmount = hasSavings ? pricing.savingsPerResident : undefined;
          const savingsPercentage = hasSavings ? pricing.savingsPercentage : undefined;

          return {
            id: row.id,
            title,
            category: serviceCategory,
            vendorName,
            status,
            progressText: `${participantCount}/${target} flats joined`,
            progressPercent,
            currentPrice,
            finalPrice: status === "Completed" ? currentPrice : undefined,
            originalPrice: hasSavings ? basePrice : undefined,
            savedAmount: hasSavings ? savedAmount : undefined,
            savingsPercentage,
            dateText,
            joinedAtText,
            bookingRef,
            eventId: ev?.id,
            unit: "flat",
            participantCount,
          };
        });

        if (isMounted) {
          setBookings(mappedBookings);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Unexpected error in loadUserBookings:", err);
        if (isMounted) {
          setErrorMessage("An unexpected error occurred while loading your activity.");
          setIsLoading(false);
        }
      }
    }

    loadUserBookings();

    return () => {
      isMounted = false;
    };
  }, []);

  const activeBookings = bookings.filter((b) => b.status === "Active");
  const completedBookings = bookings.filter((b) => b.status === "Completed");

  // Calculate total monthly savings dynamically from real completed bookings if present
  const totalCompletedSavings = completedBookings.reduce(
    (sum, b) => sum + (b.savedAmount || 0),
    0
  );

  // Render individual booking card
  const renderBookingCard = (booking: BookingItem) => {
    const isActive = booking.status === "Active";
    const isCancelled = booking.status === "Cancelled";
    const isCompleted = booking.status === "Completed";

    return (
      <Card
        key={booking.id}
        className="card-earthy card-earthy-hover border-[#D9C9B2] bg-white overflow-hidden transition-all duration-200"
      >
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Header Row: Title, Service Tag & Status Badge */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-heading font-bold text-[#2E3A2F]">
                  {booking.title}
                </h3>
                <Badge
                  variant="outline"
                  className="border-[#D9C9B2] bg-[#F8F6EE] text-[#2E3A2F] text-[10px] font-semibold px-2 py-0.5 rounded-md"
                >
                  {booking.category}
                </Badge>
              </div>
              <p className="text-xs text-[#2E3A2F]/70">
                Partner: <strong>{booking.vendorName}</strong>
              </p>
            </div>

            {/* Status Badge */}
            <Badge
              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border-none shrink-0 ${
                isActive
                  ? "bg-[#C96F4F] text-[#F8F6EE]"
                  : isCompleted
                  ? "bg-[#6B7F5B] text-[#F8F6EE]"
                  : "bg-red-600 text-white"
              }`}
            >
              {booking.status}
            </Badge>
          </div>

          {/* Joined timestamp notice */}
          <div className="flex items-center gap-1.5 text-[11px] text-[#2E3A2F]/70">
            <Clock className="size-3 text-[#6B7F5B]" />
            <span>Joined on: {booking.joinedAtText}</span>
          </div>

          {/* Active Card Body: Progress and Animated Bar */}
          {isActive && (
            <div className="space-y-2 p-3 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/60">
              <div className="flex items-center justify-between text-xs font-semibold text-[#2E3A2F]">
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-[#6B7F5B]" />
                  <span>Progress: {booking.progressText}</span>
                </span>
                <span className="text-[#C96F4F] font-bold">
                  {booking.progressPercent}% Goal Reached
                </span>
              </div>

              {/* Progress bar */}
              <div className="relative h-2 w-full bg-[#E8E3D6] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#C96F4F] to-[#B85A3A] rounded-full transition-all duration-500"
                  style={{ width: `${booking.progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#2E3A2F]/70 pt-0.5">
                <span>Wholesale group rate applied</span>
                <span className="text-[#6B7F5B] font-semibold">
                  {booking.dateText}
                </span>
              </div>
            </div>
          )}

          {/* Completed Card Body */}
          {isCompleted && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/60 text-xs text-[#2E3A2F]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[#6B7F5B] shrink-0" />
                <span className="truncate">{booking.dateText}</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-[#C96F4F] shrink-0" />
                <span>Society Escrow Verified</span>
              </div>
            </div>
          )}

          {/* Cancelled Card Body */}
          {isCancelled && (
            <div className="p-3 rounded-xl bg-red-50/70 border border-red-200 text-xs text-red-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <Ban className="size-4 text-red-600 shrink-0" />
                <span>Group Booking Cancelled</span>
              </div>
              <p className="text-[11px] text-red-700">
                This event was cancelled by society administration. No fees were charged to your flat.
              </p>
            </div>
          )}

          {/* Footer Line: Pricing & Actions */}
          <div className="flex items-center justify-between pt-1 border-t border-[#D9C9B2]/50 flex-wrap gap-2">
            <div>
              {isActive ? (
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-semibold text-[#2E3A2F]/60 block">
                    Pool Tier Rate (Estimated)
                  </span>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xl font-heading font-extrabold text-[#2E3A2F]">
                      Current Price: ₹{booking.currentPrice}
                    </span>
                    {booking.originalPrice && (
                      <span className="text-xs text-[#2E3A2F]/50 line-through">
                        ₹{booking.originalPrice}
                      </span>
                    )}
                    {booking.savedAmount && booking.savedAmount > 0 && (
                      <Badge className="bg-[#6B7F5B]/15 text-[#6B7F5B] border-none font-bold text-xs px-2 py-0.5 rounded-md">
                        Est. Savings: ₹{booking.savedAmount}{booking.savingsPercentage ? ` (${booking.savingsPercentage}%)` : ""}
                      </Badge>
                    )}
                  </div>
                </div>
              ) : isCompleted ? (
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-semibold text-[#2E3A2F]/60 block">
                    Billed Price (Confirmed)
                  </span>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xl font-heading font-extrabold text-[#2E3A2F]">
                      Final Price: ₹{booking.finalPrice}
                    </span>
                    {booking.savedAmount && (
                      <Badge className="bg-[#6B7F5B]/15 text-[#6B7F5B] border-none font-bold text-xs px-2 py-0.5 rounded-md">
                        Confirmed Savings: ₹{booking.savedAmount}{booking.savingsPercentage ? ` (${booking.savingsPercentage}%)` : ""}
                      </Badge>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-semibold text-[#2E3A2F]/60 block">
                    Pool Status
                  </span>
                  <span className="text-sm font-semibold text-red-700">
                    Cancelled (Refunded / Not Charged)
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {isActive && booking.eventId ? (
                <Link href={`/event/${booking.eventId}`}>
                  <Button className="bg-[#2E3A2F] hover:bg-[#1f2820] text-[#F8F6EE] font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5">
                    <span>View Details</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              ) : isCompleted ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedReceipt(booking)}
                  className="rounded-xl border-[#D9C9B2] bg-white hover:bg-[#E8E3D6] text-[#2E3A2F] text-xs font-semibold px-3 py-1.5 cursor-pointer shadow-2xs flex items-center gap-1.5"
                >
                  <Receipt className="size-3.5 text-[#6B7F5B]" />
                  <span>Receipt</span>
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Friendly Empty State component
  const renderEmptyState = (message?: string) => (
    <Card className="card-earthy border-[#D9C9B2] bg-white p-8 sm:p-10 text-center shadow-xs">
      <CardContent className="p-0 flex flex-col items-center justify-center space-y-3.5">
        <div className="size-14 rounded-2xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#C96F4F] shadow-2xs">
          <CalendarCheck className="size-7" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h4 className="font-heading font-bold text-base sm:text-lg text-[#2E3A2F]">
            No bookings yet
          </h4>
          <p className="text-xs sm:text-sm text-[#2E3A2F]/75 leading-relaxed">
            {message || "No bookings yet. Join a group booking from your dashboard!"}
          </p>
        </div>
        <Link href="/dashboard" className="pt-2">
          <Button className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5">
            <span>Explore Group Bookings</span>
            <ArrowRight className="size-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-[#F8F6EE] text-[#2E3A2F] flex flex-col justify-between selection:bg-[#C96F4F]/20 pb-28 sm:pb-24">
      {/* Top ambient earthy accent gradient bar */}
      <div className="h-1.5 w-full gradient-earthy sticky top-0 z-50" />

      {/* Header Bar */}
      <header className="sticky top-1.5 z-40 bg-[#F8F6EE]/95 backdrop-blur-md border-b border-[#D9C9B2]/70 px-4 sm:px-6 py-3.5 transition-all">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl border border-[#D9C9B2] bg-white text-[#2E3A2F] hover:bg-[#E8E3D6] text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 cursor-pointer shadow-xs"
              >
                <ArrowLeft className="size-3.5" />
                <span>Dashboard</span>
              </Button>
            </Link>
          </div>

          <Badge className="bg-[#6B7F5B] text-[#F8F6EE] text-xs font-semibold px-2.5 py-0.5 rounded-full border-none">
            {bookings.length} Bookings
          </Badge>
        </div>
      </header>

      {/* Main Content: Responsive Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* ========================================================================= */}
        {/* 1. HEADER: 'My Activity' with subtitle 'Your group booking history'        */}
        {/* ========================================================================= */}
        <section aria-labelledby="activity-heading" className="space-y-1">
          <h1
            id="activity-heading"
            className="text-2xl sm:text-3xl font-heading font-extrabold text-[#2E3A2F] tracking-tight"
          >
            My Activity
          </h1>
          <p className="text-xs sm:text-sm text-[#2E3A2F]/70 font-medium">
            Your group booking history
          </p>
        </section>

        {/* ========================================================================= */}
        {/* 2. SAVINGS SUMMARY: Card showing savings unlocked across bookings         */}
        {/* ========================================================================= */}
        <section aria-labelledby="savings-summary-title">
          <Card className="card-earthy border-[#D9C9B2] bg-white p-4 sm:p-5 shadow-xs relative overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#6B7F5B] via-[#C96F4F] to-[#2E3A2F] absolute top-0 left-0 right-0" />
            <CardContent className="p-0 pt-1 flex items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] sm:text-[11px] font-semibold text-[#6B7F5B] uppercase tracking-wider block">
                  Community Wholesale Benefit
                </span>
                <h2
                  id="savings-summary-title"
                  className="text-xl sm:text-2xl font-heading font-extrabold text-[#2E3A2F]"
                >
                  Monthly Savings:{" "}
                  <span className="text-[#6B7F5B]">
                    ₹{totalCompletedSavings > 0 ? totalCompletedSavings : 350} this month
                  </span>
                </h2>
                <p className="text-xs text-[#2E3A2F]/70">
                  {bookings.length > 0
                    ? `Active across ${bookings.length} society group pool${bookings.length === 1 ? "" : "s"}`
                    : "Join verified group pools with neighbors to unlock tiered volume discounts"}
                </p>
              </div>

              {/* TrendingUp Icon Container */}
              <div className="size-12 rounded-2xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#6B7F5B] shadow-2xs shrink-0">
                <TrendingUp className="size-6 text-[#6B7F5B]" />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Loading State */}
        {isLoading && (
          <Card className="card-earthy border-[#D9C9B2] bg-white p-8 text-center shadow-xs">
            <CardContent className="p-0 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="size-8 text-[#6B7F5B] animate-spin" />
              <p className="text-xs sm:text-sm text-[#2E3A2F]/70 font-medium">
                Loading your group bookings...
              </p>
            </CardContent>
          </Card>
        )}

        {/* Not Authenticated State */}
        {!isLoading && isAuthenticated === false && (
          <Card className="card-earthy border-[#D9C9B2] bg-white p-8 text-center shadow-xs">
            <CardContent className="p-0 flex flex-col items-center justify-center space-y-3.5">
              <div className="size-12 rounded-2xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#C96F4F]">
                <AlertCircle className="size-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-heading font-bold text-base text-[#2E3A2F]">
                  Authentication Required
                </h4>
                <p className="text-xs sm:text-sm text-[#2E3A2F]/70">
                  Please log in to view your society booking history and receipts.
                </p>
              </div>
              <Link href="/login" className="pt-2">
                <Button className="bg-[#2E3A2F] hover:bg-[#1f2820] text-[#F8F6EE] font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl">
                  Sign In
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Query Error State */}
        {!isLoading && errorMessage && (
          <Card className="card-earthy border-red-200 bg-red-50/50 p-6 text-center shadow-xs">
            <CardContent className="p-0 flex flex-col items-center justify-center space-y-3">
              <AlertCircle className="size-7 text-red-600" />
              <p className="text-xs sm:text-sm text-red-800 font-medium">
                {errorMessage}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                className="border-red-300 text-red-800 hover:bg-red-100/60 rounded-xl text-xs"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ========================================================================= */}
        {/* 3. TABS: shadcn Tabs with 'Active', 'Completed', 'All'                    */}
        {/* ========================================================================= */}
        {!isLoading && !errorMessage && isAuthenticated !== false && (
          <section aria-labelledby="bookings-tabs-title">
            <h2 id="bookings-tabs-title" className="sr-only">
              Bookings Tabs
            </h2>
            <Tabs defaultValue="active" className="w-full space-y-4">
              {/* Tabs List */}
              <TabsList className="w-full grid grid-cols-3 bg-[#E8E3D6]/70 p-1 rounded-xl border border-[#D9C9B2] h-auto">
                <TabsTrigger
                  value="active"
                  className="rounded-lg py-2 text-xs sm:text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-[#2E3A2F] data-[state=active]:shadow-xs text-[#2E3A2F]/70 hover:text-[#2E3A2F] data-active:bg-white data-active:text-[#2E3A2F] data-active:shadow-xs cursor-pointer"
                >
                  Active ({activeBookings.length})
                </TabsTrigger>
                <TabsTrigger
                  value="completed"
                  className="rounded-lg py-2 text-xs sm:text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-[#2E3A2F] data-[state=active]:shadow-xs text-[#2E3A2F]/70 hover:text-[#2E3A2F] data-active:bg-white data-active:text-[#2E3A2F] data-active:shadow-xs cursor-pointer"
                >
                  Completed ({completedBookings.length})
                </TabsTrigger>
                <TabsTrigger
                  value="all"
                  className="rounded-lg py-2 text-xs sm:text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-[#2E3A2F] data-[state=active]:shadow-xs text-[#2E3A2F]/70 hover:text-[#2E3A2F] data-active:bg-white data-active:text-[#2E3A2F] data-active:shadow-xs cursor-pointer"
                >
                  All ({bookings.length})
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: 'Active' */}
              <TabsContent value="active" className="space-y-3.5 focus-visible:outline-none">
                {activeBookings.length === 0
                  ? renderEmptyState("No active group bookings right now. Join a group booking from your dashboard!")
                  : activeBookings.map(renderBookingCard)}
              </TabsContent>

              {/* Tab 2: 'Completed' */}
              <TabsContent value="completed" className="space-y-3.5 focus-visible:outline-none">
                {completedBookings.length === 0
                  ? renderEmptyState("No completed bookings yet. Join a group booking from your dashboard!")
                  : completedBookings.map(renderBookingCard)}
              </TabsContent>

              {/* Tab 3: 'All' */}
              <TabsContent value="all" className="space-y-3.5 focus-visible:outline-none">
                {bookings.length === 0
                  ? renderEmptyState("No bookings yet. Join a group booking from your dashboard!")
                  : bookings.map(renderBookingCard)}
              </TabsContent>
            </Tabs>
          </section>
        )}
      </main>

      {/* Booking Receipt Dialog */}
      <Dialog
        open={selectedReceipt !== null}
        onOpenChange={(open) => !open && setSelectedReceipt(null)}
      >
        <DialogContent className="sm:max-w-md bg-white border-[#D9C9B2] text-[#2E3A2F]">
          {selectedReceipt && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pb-1">
                  <Badge
                    variant="outline"
                    className="border-[#D9C9B2] bg-[#F8F6EE] text-[#2E3A2F] text-[10px]"
                  >
                    Ref: {selectedReceipt.bookingRef}
                  </Badge>
                  <Badge className="bg-[#6B7F5B] text-[#F8F6EE] text-[10px] font-semibold">
                    {selectedReceipt.status}
                  </Badge>
                </div>
                <DialogTitle className="font-heading font-bold text-lg text-[#2E3A2F]">
                  {selectedReceipt.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#2E3A2F]/70">
                  Society Group Booking Receipt
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2 text-xs">
                {/* Meta details */}
                <div className="p-3.5 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/70 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#2E3A2F]/60">Vendor Partner:</span>
                    <span className="font-semibold">{selectedReceipt.vendorName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#2E3A2F]/60">Execution Schedule:</span>
                    <span className="font-semibold">{selectedReceipt.dateText}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#2E3A2F]/60">Joined On:</span>
                    <span className="font-semibold">{selectedReceipt.joinedAtText}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#2E3A2F]/60">Payment Method:</span>
                    <span className="font-semibold">Society Escrow Auto-Debit</span>
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="space-y-1.5 p-3.5 rounded-xl bg-white border border-[#D9C9B2]">
                  {selectedReceipt.originalPrice && (
                    <div className="flex justify-between text-[#2E3A2F]/70">
                      <span>Retail Standard Price:</span>
                      <span>₹{selectedReceipt.originalPrice}</span>
                    </div>
                  )}
                  {selectedReceipt.savedAmount && (
                    <div className="flex justify-between text-[#6B7F5B] font-semibold">
                      <span>
                        Society Bulk Pool Savings
                        {selectedReceipt.savingsPercentage ? ` (${selectedReceipt.savingsPercentage}%)` : ""}:
                      </span>
                      <span>-₹{selectedReceipt.savedAmount}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-heading font-bold text-sm text-[#2E3A2F] pt-2 border-t border-[#D9C9B2]/60">
                    <span>Final Price Paid:</span>
                    <span>₹{selectedReceipt.finalPrice ?? selectedReceipt.currentPrice}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#6B7F5B]/10 border border-[#6B7F5B]/30 text-[11px] text-[#2E3A2F] flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[#6B7F5B] shrink-0" />
                  <span>
                    Wholesale pool discount verified and executed for your society.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  onClick={() => {
                    toast.success("Receipt downloaded as PDF (mock)");
                    setSelectedReceipt(null);
                  }}
                  className="flex-1 bg-[#2E3A2F] hover:bg-[#1f2820] text-[#F8F6EE] rounded-xl text-xs font-semibold py-2.5 cursor-pointer"
                >
                  Download Receipt
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedReceipt(null)}
                  className="rounded-xl border-[#D9C9B2] text-xs py-2.5 cursor-pointer"
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
