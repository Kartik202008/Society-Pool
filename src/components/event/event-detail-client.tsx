"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Building2,
  Clock,
  Users,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  MessageCircle,
  Copy,
  Check,
  Tag,
  Star,
  Info,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { JoinButton } from "@/components/JoinButton";
import {
  parsePriceTiers,
  calculateEventPricing,
  formatSlotTime,
} from "@/lib/pricing";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { DatabaseEventRow, PriceTier, FlatServiceStatus } from "@/types";

export interface EventParticipant {
  id: string;
  flat_no: string;
  user_id?: string;
  joined_at?: string;
  service_status?: FlatServiceStatus;
  issue_description?: string | null;
  resident_verified_at?: string | null;
  vendor_completed_at?: string | null;
}

export interface EventDetailClientProps {
  event: DatabaseEventRow & {
    participants?: EventParticipant[];
  };
  currentUser?: {
    id?: string | null;
    flatNo?: string | null;
    role?: string | null;
    participantId?: string | null;
  };
}

export function EventDetailClient({
  event: initialEvent,
  currentUser,
}: EventDetailClientProps) {
  const [event, setEvent] = React.useState(initialEvent);
  const [participants, setParticipants] = React.useState<EventParticipant[]>(
    initialEvent.participants || []
  );
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [isReportingIssue, setIsReportingIssue] = React.useState(false);
  const [issueText, setIssueText] = React.useState("");
  const [isSubmittingAction, setIsSubmittingAction] = React.useState(false);
  const supabase = createClient();

  // Subscribe to realtime participant joins for this specific event
  React.useEffect(() => {
    const channel = supabase
      .channel(`event-detail-${event.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "participants",
          filter: `event_id=eq.${event.id}`,
        },
        (payload) => {
          const newParticipant = payload.new as EventParticipant;
          setParticipants((prev) => {
            if (prev.some((p) => p.id === newParticipant.id)) return prev;
            return [...prev, newParticipant];
          });
          toast.success(`🎉 ${newParticipant.flat_no || "A neighbor"} joined the pool!`);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
          filter: `id=eq.${event.id}`,
        },
        (payload) => {
          const updated = payload.new as DatabaseEventRow;
          setEvent((prev) => ({
            ...prev,
            ...updated,
            participants: prev.participants,
          }));
          if (updated.status === "cancelled") {
            toast.error("⚠️ This event has been cancelled by society management.");
          } else {
            toast.info("ℹ️ Event details have been updated.");
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "participants",
          filter: `event_id=eq.${event.id}`,
        },
        (payload) => {
          const updatedParticipant = payload.new as EventParticipant;
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === updatedParticipant.id ? { ...p, ...updatedParticipant } : p
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [event.id]);

  // Find current user's enrolled participant record
  const myParticipant = React.useMemo(() => {
    if (!currentUser) return null;
    if (currentUser.participantId) {
      const found = participants.find((p) => p.id === currentUser.participantId);
      if (found) return found;
    }
    return (
      participants.find(
        (p) =>
          (currentUser.id && p.user_id && p.user_id === currentUser.id) ||
          (currentUser.flatNo &&
            p.flat_no &&
            p.flat_no.toLowerCase().trim() === currentUser.flatNo.toLowerCase().trim())
      ) || null
    );
  }, [participants, currentUser]);

  const handleResidentVerify = async (participantId: string) => {
    setIsSubmittingAction(true);
    try {
      const res = await fetch("/api/resident/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          participant_id: participantId,
          action: "verify",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to confirm service completion.");
        return;
      }

      toast.success("Service Confirmed!", {
        description: "You have verified that the service was completed satisfactorily.",
      });

      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId
            ? {
                ...p,
                service_status: "verified",
                resident_verified_at: new Date().toISOString(),
              }
            : p
        )
      );

      // Re-sync with Supabase to ensure server/client state parity
      const { data: refreshed } = await supabase
        .from("participants")
        .select(
          "id, flat_no, user_id, joined_at, service_status, issue_description, resident_verified_at, vendor_completed_at"
        )
        .eq("event_id", event.id);

      if (refreshed && refreshed.length > 0) {
        setParticipants(refreshed as EventParticipant[]);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Network error confirming service.";
      toast.error(message);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleResidentReportIssue = async (participantId: string) => {
    if (!issueText.trim() || issueText.trim().length < 3) {
      toast.error("Please provide a description of the issue (at least 3 characters).");
      return;
    }

    setIsSubmittingAction(true);
    try {
      const res = await fetch("/api/resident/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          participant_id: participantId,
          action: "report_issue",
          issue_description: issueText.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to report issue.");
        return;
      }

      toast.error("Issue Reported", {
        description: "Your report has been logged. Society secretary and vendor have been alerted.",
      });

      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId
            ? {
                ...p,
                service_status: "issue_reported",
                issue_description: issueText.trim(),
                issue_reported_at: new Date().toISOString(),
              }
            : p
        )
      );
      setIsReportingIssue(false);
      setIssueText("");

      // Re-sync with Supabase to ensure server/client state parity
      const { data: refreshed } = await supabase
        .from("participants")
        .select(
          "id, flat_no, user_id, joined_at, service_status, issue_description, resident_verified_at, vendor_completed_at"
        )
        .eq("event_id", event.id);

      if (refreshed && refreshed.length > 0) {
        setParticipants(refreshed as EventParticipant[]);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Network error reporting issue.";
      toast.error(message);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const participantCount = participants.length;
  const verifiedCount = participants.filter((p) => p.service_status === "verified").length;
  const awaitingCount = participants.filter((p) => p.service_status === "awaiting_confirmation").length;
  const issueCount = participants.filter((p) => p.service_status === "issue_reported").length;
  const pendingCount = participants.filter((p) => !p.service_status || p.service_status === "remaining").length;
  const rawTiers = parsePriceTiers(event.price_tiers);
  const tiers =
    rawTiers.length > 0
      ? rawTiers
      : [
          { minFlats: 1, maxFlats: 5, price: 499, discountPercentage: 0 },
          { minFlats: 6, maxFlats: 15, price: 399, discountPercentage: 20 },
          { minFlats: 16, maxFlats: null, price: 299, discountPercentage: 40 },
        ];

  const minParticipants = event.min_participants || 10;
  const maxParticipants = event.max_participants || null;

  const pricing = calculateEventPricing(
    participantCount,
    tiers,
    minParticipants,
    maxParticipants
  );

  // Track previous price for real-time price drop notifications
  const prevPriceRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (prevPriceRef.current !== null && pricing.currentPrice < prevPriceRef.current) {
      const dropDetail =
        pricing.nextTierNeeded && pricing.nextTierPrice
          ? `${pricing.nextTierNeeded} more needed for ₹${pricing.nextTierPrice}!`
          : "Maximum society discount unlocked!";
      toast.success(`🎉 Price dropped to ₹${pricing.currentPrice}! ${dropDetail}`, {
        duration: 5000,
        className: "border-[#D9C9B2] bg-[#F8F6EE] text-[#2E3A2F]",
      });
    }
    prevPriceRef.current = pricing.currentPrice;
  }, [pricing.currentPrice, pricing.nextTierNeeded, pricing.nextTierPrice]);

  const target =
    event.min_participants && event.min_participants > 0
      ? event.min_participants
      : pricing.targetCount || minParticipants || 10;

  // Large animated progress bar calculation: clamp visually to 100% while actual participantCount remains uncapped
  const progressPercent = Math.min(
    100,
    target > 0 ? Math.max(0, Math.round((participantCount / target) * 100)) : 0
  );

  // Find best-value tier (lowest price)
  const bestValueTier = React.useMemo(() => {
    if (!tiers.length) return null;
    return tiers.reduce((min, t) => (t.price < min.price ? t : min), tiers[0]);
  }, [tiers]);

  // Find currently active tier - safe against participantCount exceeding target or maxFlats
  const activeTier = React.useMemo(() => {
    if (!tiers || tiers.length === 0) return null;
    const sorted = [...tiers].sort((a, b) => a.minFlats - b.minFlats);
    const match = sorted.find((t) => {
      const max = t.maxFlats ?? Infinity;
      return participantCount >= t.minFlats && participantCount <= max;
    });

    if (match) return match;

    if (participantCount < sorted[0].minFlats) {
      return sorted[0];
    }
    // Participant count exceeds all tiers -> use the highest tier (lowest rate)
    return sorted[sorted.length - 1];
  }, [tiers, participantCount]);

  const isVendor = currentUser?.role === "vendor";
  const isResident = !isVendor;

  // WhatsApp share link generator: dynamic origin and rich structured message
  const getWhatsAppShareUrl = () => {
    if (typeof window === "undefined") return "#";
    const currentUrl = window.location.href;
    const target = pricing.targetCount;
    const schedule = event.slot_time ? ` • ${formatSlotTime(event.slot_time)}` : "";

    const shareText = `🏠 SocietyPool Group Booking

${event.title}${schedule}

Current group price: ₹${pricing.currentPrice}/flat

${participantCount}/${target} flats joined.

Join your society group and unlock a lower price!

Join here:
${currentUrl}`;

    return `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  };

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      toast.success("Event link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6EE] text-[#2E3A2F] flex flex-col justify-between selection:bg-[#C96F4F]/20 pb-36 sm:pb-32">
      {/* Top ambient earthy accent gradient bar */}
      <div className="h-1.5 w-full gradient-earthy sticky top-0 z-50" />

      {/* Top Bar with Navigation & Actions */}
      <header className="sticky top-1.5 z-40 bg-[#F8F6EE]/95 backdrop-blur-md border-b border-[#D9C9B2]/70 px-4 sm:px-6 py-3 transition-all">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link href="/dashboard">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl border border-[#D9C9B2] bg-white text-[#2E3A2F] hover:bg-[#E8E3D6] text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 cursor-pointer shadow-xs"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back to Dashboard</span>
            </Button>
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="rounded-xl border-[#D9C9B2] bg-white hover:bg-[#E8E3D6] text-[#2E3A2F] text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              {copiedLink ? (
                <>
                  <Check className="size-3.5 text-[#6B7F5B]" />
                  <span className="text-[#6B7F5B]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </Button>

            <a
              href={getWhatsAppShareUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-semibold px-3 py-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <MessageCircle className="size-3.5 fill-white text-white" />
              <span className="hidden sm:inline">Share on WhatsApp</span>
              <span className="sm:hidden">Share</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top Header Card: Title, Service Type, Vendor, Slot Time, Status */}
        <section aria-labelledby="event-title">
          <Card className="card-earthy border-[#D9C9B2] bg-white overflow-hidden shadow-xs relative">
            <div className="h-1 w-full bg-gradient-to-r from-[#6B7F5B] via-[#C96F4F] to-[#2E3A2F]" />
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="border-[#D9C9B2] bg-[#F8F6EE] text-[#2E3A2F] text-xs font-semibold px-2.5 py-0.5 rounded-lg"
                  >
                    {event.service_type || "Home Service"}
                  </Badge>
                  <Badge
                    className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border-none ${
                      event.status === "cancelled"
                        ? "bg-red-100 text-red-700 border border-red-200"
                        : event.status === "open"
                        ? "bg-[#6B7F5B] text-[#F8F6EE]"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {event.status === "cancelled"
                      ? "Cancelled"
                      : event.status === "open"
                      ? "Active Group Pool"
                      : "Completed"}
                  </Badge>
                </div>

                <div className="flex items-center gap-1 text-xs font-semibold text-[#6B7F5B] bg-[#E8E3D6]/50 px-2.5 py-1 rounded-lg">
                  <Star className="size-3.5 fill-[#6B7F5B] text-[#6B7F5B]" />
                  <span>4.9 Verified Vendor</span>
                </div>
              </div>

              {event.status === "cancelled" && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-2.5">
                  <AlertCircle className="size-4 text-red-600 shrink-0" />
                  <p className="text-xs font-medium text-red-800">
                    <strong>Booking Pool Cancelled:</strong> This event has been cancelled by society management and is no longer accepting new participants.
                  </p>
                </div>
              )}

              <div>
                <h1
                  id="event-title"
                  className="text-2xl sm:text-3xl font-heading font-extrabold text-[#2E3A2F] tracking-tight"
                >
                  {event.title}
                </h1>
                <p className="text-xs sm:text-sm text-[#2E3A2F]/70 mt-1">
                  Housing Society Bulk Pool • Exclusive Resident Community Rates
                </p>
              </div>

              {/* Vendor Name & Slot Time Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/60 text-[#2E3A2F]">
                  <Building2 className="size-4 text-[#6B7F5B] shrink-0" />
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-[#2E3A2F]/60 block">
                      Partner Vendor
                    </span>
                    <span className="font-semibold text-sm">
                      {event.vendor_name || "Society Verified Partner"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/60 text-[#2E3A2F]">
                  <Clock className="size-4 text-[#C96F4F] shrink-0" />
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-[#2E3A2F]/60 block">
                      Execution Slot Time
                    </span>
                    <span className="font-semibold text-sm">
                      {formatSlotTime(event.slot_time)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Notice for Vendors */}
        {isVendor && (
          <section aria-labelledby="vendor-admin-view-notice">
            <Card className="border-[#D9C9B2] bg-[#FAF9F5] p-4 text-xs text-[#2E3A2F]/80 shadow-2xs">
              <div className="flex items-center gap-2 font-semibold text-[#2E3A2F]">
                <ShieldCheck className="size-4 text-[#6B7F5B]" />
                <span>
                  Viewing as Partner Vendor
                </span>
              </div>
              <p className="mt-1 text-[#2E3A2F]/70">
                Service verification actions (Confirm Service and Report Issue) are accessible only to enrolled resident flats. You can monitor overall flat progress in the Participant List below.
              </p>
            </Card>
          </section>
        )}

        {/* Resident Flat Service Verification & Handoff Card */}
        {isResident && (
          <section aria-labelledby="resident-service-verification">
            <Card
              className={`card-earthy overflow-hidden shadow-xs relative transition-all ${
                myParticipant?.service_status === "awaiting_confirmation"
                  ? "border-amber-400 bg-amber-50/40 ring-1 ring-amber-300"
                  : "border-[#D9C9B2] bg-white"
              }`}
            >
              <div
                className={`h-1.5 w-full ${
                  !myParticipant
                    ? "bg-[#D9C9B2]"
                    : myParticipant.service_status === "verified"
                    ? "bg-emerald-600"
                    : myParticipant.service_status === "awaiting_confirmation"
                    ? "bg-amber-500 animate-pulse"
                    : myParticipant.service_status === "issue_reported"
                    ? "bg-rose-500"
                    : "bg-[#6B7F5B]"
                }`}
              />
              <CardContent className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6B7F5B]">
                        Resident Service Verification
                      </span>
                      <span className="size-1 rounded-full bg-[#C96F4F]" />
                      <span className="text-xs font-bold text-[#2E3A2F]">
                        {myParticipant ? `Flat ${myParticipant.flat_no}` : "Not Enrolled"}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-heading font-bold text-[#2E3A2F]">
                      {!myParticipant && "Join this Group Booking to Enable Service Verification"}
                      {myParticipant && myParticipant.service_status === "verified" && "Service Confirmed & Verified"}
                      {myParticipant && myParticipant.service_status === "awaiting_confirmation" &&
                        "Action Required — Service Completed by Vendor"}
                      {myParticipant && myParticipant.service_status === "issue_reported" &&
                        "Service Issue Reported"}
                      {myParticipant && (!myParticipant.service_status ||
                        myParticipant.service_status === "remaining") &&
                        "Service Scheduled — Awaiting Vendor Completion"}
                    </h3>
                  </div>

                  <div>
                    {!myParticipant && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E3A2F]/70 bg-[#2E3A2F]/5 px-3 py-1 rounded-full border border-[#D9C9B2]">
                        <Info className="size-4 text-[#2E3A2F]/60" />
                        <span>Not Joined</span>
                      </span>
                    )}
                    {myParticipant && myParticipant.service_status === "verified" && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-300">
                        <CheckCircle className="size-4 text-emerald-600" />
                        <span>Resident Verified</span>
                      </span>
                    )}
                    {myParticipant && myParticipant.service_status === "awaiting_confirmation" && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 px-3 py-1 rounded-full shadow-xs animate-pulse">
                        <Clock className="size-4 text-white" />
                        <span>Action Required</span>
                      </span>
                    )}
                    {myParticipant && myParticipant.service_status === "issue_reported" && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800 bg-rose-50 px-3 py-1 rounded-full border border-rose-300">
                        <AlertTriangle className="size-4 text-rose-600" />
                        <span>Issue Flagged</span>
                      </span>
                    )}
                    {myParticipant && (!myParticipant.service_status ||
                      myParticipant.service_status === "remaining") && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2E3A2F]/70 bg-[#2E3A2F]/5 px-3 py-1 rounded-full border border-[#D9C9B2]">
                        <Clock className="size-4 text-[#2E3A2F]/60" />
                        <span>Awaiting Vendor Visit</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* State Explanations & Action Triggers */}
                {!myParticipant && (
                  <div className="bg-[#F8F6EE] border border-[#D9C9B2]/80 rounded-xl p-4 text-xs text-[#2E3A2F]/80 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-[#2E3A2F]">
                      <Info className="size-4 text-[#C96F4F] shrink-0" />
                      <span>You have not joined this booking yet.</span>
                    </div>
                    <p className="leading-relaxed">
                      You must join this society group booking pool with your flat first to schedule service and unlock wholesale society pricing.
                      Once joined and {event.vendor_name || "the vendor"} marks your service complete from their dashboard, the <strong>Confirm Service</strong> and <strong>Report Issue</strong> actions will appear here for your sign-off.
                    </p>
                  </div>
                )}

                {myParticipant && (!myParticipant.service_status || myParticipant.service_status === "remaining") && (
                  <div className="bg-[#F8F6EE] border border-[#D9C9B2]/80 rounded-xl p-4 text-xs text-[#2E3A2F]/80 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-[#2E3A2F]">
                      <Clock className="size-4 text-[#6B7F5B] shrink-0" />
                      <span>Vendor has not marked your flat complete yet.</span>
                    </div>
                    <p className="leading-relaxed">
                      Your flat (<strong>{myParticipant.flat_no}</strong>) is confirmed and enrolled in this pool. Service will be executed during the scheduled slot ({formatSlotTime(event.slot_time)}).
                      Verification controls (<strong>Confirm Service</strong> and <strong>Report Issue</strong>) will automatically become active here as soon as {event.vendor_name || "the vendor"} finishes the job and records completion on their dashboard.
                    </p>
                  </div>
                )}

                {myParticipant && myParticipant.service_status === "awaiting_confirmation" && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-xs">
                    <div className="flex items-start gap-2.5">
                      <div className="size-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                        <Clock className="size-4 text-amber-600 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-amber-950">
                          Vendor marked service complete for Flat {myParticipant.flat_no}
                        </h4>
                        <p className="text-xs text-amber-900/90 leading-relaxed">
                          <strong>{event.vendor_name || "The vendor"}</strong> has finished servicing your flat. Please inspect the work and confirm completion, or report any issue if something was missed.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <Button
                        size="sm"
                        disabled={isSubmittingAction}
                        onClick={() => handleResidentVerify(myParticipant.id)}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs px-4 py-2.5 rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        {isSubmittingAction ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5 text-emerald-200" />
                        )}
                        <span>Confirm Service</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSubmittingAction}
                        onClick={() => setIsReportingIssue(true)}
                        className="border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs px-3.5 py-2.5 rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        <AlertTriangle className="size-3.5 text-rose-600" />
                        <span>Report Issue</span>
                      </Button>
                    </div>
                  </div>
                )}

                {myParticipant && myParticipant.service_status === "verified" && (
                  <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-xl p-3.5 text-xs text-emerald-950 flex items-center gap-2.5">
                    <CheckCircle className="size-4 text-emerald-600 shrink-0" />
                    <span>
                      Thank you! You have confirmed satisfactory completion of this service for <strong>{myParticipant.flat_no}</strong>.
                      {myParticipant.resident_verified_at && (
                        <span className="block text-[11px] text-emerald-800/80 mt-0.5">
                          Verified on {new Date(myParticipant.resident_verified_at).toLocaleString()}
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {myParticipant && myParticipant.service_status === "issue_reported" && (
                  <div className="bg-rose-50/70 border border-rose-200/90 rounded-xl p-3.5 space-y-2 text-xs text-rose-950">
                    <div className="flex items-center gap-2 font-semibold text-rose-900">
                      <AlertTriangle className="size-4 text-rose-600 shrink-0" />
                      <span>Issue description logged:</span>
                    </div>
                    <blockquote className="border-l-2 border-rose-300 pl-2.5 text-rose-900 italic text-xs">
                      &ldquo;{myParticipant.issue_description || "Service incomplete or unsatisfactory"}&rdquo;
                    </blockquote>
                    <p className="text-[11px] text-rose-800/80">
                      Society management and {event.vendor_name || "the vendor"} have been notified to contact you for resolution.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSubmittingAction}
                      onClick={() => handleResidentVerify(myParticipant.id)}
                      className="border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 text-[11px] font-semibold h-7 px-2.5 cursor-pointer mt-1"
                    >
                      Issue Resolved? Confirm Completion
                    </Button>
                  </div>
                )}

                {/* Development-Only Diagnostics Box (Safe & Non-Intrusive) */}
                <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-[11px] text-[#2E3A2F]/80 space-y-1.5 font-mono">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                    <span>Resident Status Diagnostics</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">Privacy Preserved</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    <div>Auth User: <span className="font-semibold text-gray-900">{currentUser?.id ? `${currentUser.id.slice(0, 8)}...` : "None"}</span></div>
                    <div>Session Role: <span className="font-semibold text-gray-900">{currentUser?.role || "resident"}</span></div>
                    <div>Resolved Flat: <span className="font-semibold text-gray-900">{currentUser?.flatNo || "None"}</span></div>
                    <div>Enrolled Participant: <span className="font-semibold text-gray-900">{myParticipant ? `Yes (${myParticipant.flat_no})` : "No"}</span></div>
                    <div>Participant ID: <span className="font-semibold text-gray-900">{myParticipant ? `${myParticipant.id.slice(0, 8)}...` : "None"}</span></div>
                    <div>Service Status: <span className={`font-semibold ${myParticipant?.service_status === "awaiting_confirmation" ? "text-amber-700" : myParticipant?.service_status === "verified" ? "text-emerald-700" : myParticipant?.service_status === "issue_reported" ? "text-rose-700" : "text-gray-700"}`}>{myParticipant?.service_status || (myParticipant ? "remaining" : "not_joined")}</span></div>
                  </div>
                  <div className="pt-1.5 text-[11px] text-gray-700 font-sans border-t border-gray-200 mt-1">
                    <strong>Controls Hidden Reason: </strong>
                    {isVendor && "Resident verification actions are hidden because you are signed in as a vendor."}
                    {!isVendor && !myParticipant && "Resident verification actions are hidden because you have not joined this group booking yet."}
                    {!isVendor && myParticipant && (!myParticipant.service_status || myParticipant.service_status === "remaining") && "Resident verification actions are hidden because the vendor has not marked your flat complete yet."}
                    {!isVendor && myParticipant && myParticipant.service_status === "verified" && "Resident verification actions are hidden because service has already been confirmed and verified."}
                    {!isVendor && myParticipant && myParticipant.service_status === "issue_reported" && "Resident verification actions are hidden because an issue has already been reported."}
                    {!isVendor && myParticipant && myParticipant.service_status === "awaiting_confirmation" && "Controls are active: You can Confirm Service or Report an Issue."}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Large Animated Progress Bar Card */}
        <section aria-labelledby="progress-section-title">
          <Card className="card-earthy border-[#D9C9B2] bg-white p-5 sm:p-6 shadow-xs">
            <CardContent className="space-y-4 p-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2
                    id="progress-section-title"
                    className="text-base sm:text-lg font-heading font-bold text-[#2E3A2F] flex items-center gap-2"
                  >
                    <Users className="size-4 text-[#C96F4F]" />
                    <span>Participation Progress</span>
                  </h2>
                  <p className="text-xs text-[#2E3A2F]/70 mt-0.5">
                    {participantCount >= target
                      ? "Pool is activated! Wholesale group pricing is unlocked."
                      : `${Math.max(1, target - participantCount)} more flats needed to reach minimum pool size.`}
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-heading font-extrabold text-[#2E3A2F]">
                    {participantCount}{" "}
                    <span className="text-sm font-normal text-[#2E3A2F]/60">
                      / {target} flats
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-[#6B7F5B]">
                    {progressPercent}% Goal Reached
                  </span>
                </div>
              </div>

              {/* Large Animated Bar using Framer Motion */}
              <div
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${participantCount} of ${target} flats joined`}
                className="relative h-4 sm:h-5 w-full bg-[#E8E3D6] rounded-full overflow-hidden p-0.5 border border-[#D9C9B2]"
              >
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#C96F4F] via-[#B85A3A] to-[#6B7F5B] relative overflow-hidden"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(4, Math.min(100, progressPercent))}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                </motion.div>
              </div>

              <div className="flex items-center justify-between text-xs text-[#2E3A2F]/80 pt-1 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-[#6B7F5B]" />
                    <span>
                      Current Active Price: <strong>₹{pricing.currentPrice}/flat</strong>
                    </span>
                  </span>
                  {pricing.savingsPerResident > 0 && (
                    <Badge className="bg-[#6B7F5B]/15 text-[#6B7F5B] border-none font-bold text-xs px-2 py-0.5 rounded-md">
                      Save ₹{pricing.savingsPerResident} ({pricing.savingsPercentage}%)
                    </Badge>
                  )}
                </div>

                {pricing.nextTierPrice && pricing.nextTierNeeded ? (
                  <span className="text-[#C96F4F] font-semibold">
                    {pricing.nextTierNeeded} more flats for ₹{pricing.nextTierPrice}!
                  </span>
                ) : (
                  <span className="text-[#6B7F5B] font-semibold">
                    Maximum society discount unlocked!
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Dynamic Pricing Tier Card */}
        <section aria-labelledby="pricing-tiers-title">
          <Card className="card-earthy border-[#D9C9B2] bg-white p-5 sm:p-6 shadow-xs">
            <CardHeader className="p-0 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle
                    id="pricing-tiers-title"
                    className="text-base sm:text-lg font-heading font-bold text-[#2E3A2F] flex items-center gap-2"
                  >
                    <Tag className="size-4 text-[#C96F4F]" />
                    <span>Dynamic Pricing Tiers</span>
                  </CardTitle>
                  <p className="text-xs text-[#2E3A2F]/70 mt-0.5">
                    Price drops automatically for every neighbor who joins.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-[#D9C9B2] bg-[#F8F6EE] text-[#2E3A2F] text-[10px] font-semibold"
                >
                  Bulk Ladder
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 p-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {tiers.map((tier, index) => {
                  const isActive = activeTier?.minFlats === tier.minFlats;
                  const isBestValue = bestValueTier?.minFlats === tier.minFlats;

                  const rangeText =
                    tier.maxFlats != null && tier.maxFlats < 999
                      ? `${tier.minFlats}-${tier.maxFlats} flats`
                      : `${tier.minFlats}+ flats`;

                  return (
                    <div
                      key={index}
                      className={`relative p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                        isActive
                          ? "bg-[#D9C9B2] border-[#C4B196] shadow-xs text-[#2E3A2F]"
                          : isBestValue
                          ? "bg-[#6B7F5B]/15 border-[#6B7F5B] text-[#2E3A2F]"
                          : "bg-[#F8F6EE]/60 border-[#D9C9B2]/60 text-[#2E3A2F]/80"
                      }`}
                    >
                      {/* Top Badges: Best Value or Active Tier */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span className="text-[11px] font-bold text-[#2E3A2F]/70 uppercase tracking-wider">
                          Tier {index + 1}
                        </span>

                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {isActive && (
                            <Badge className="bg-[#2E3A2F] text-[#F8F6EE] text-[9px] font-bold px-1.5 py-0.5 rounded-md border-none">
                              Active Tier
                            </Badge>
                          )}
                          {isBestValue && (
                            <Badge className="bg-[#6B7F5B] text-[#F8F6EE] text-[9px] font-bold px-1.5 py-0.5 rounded-md border-none flex items-center gap-0.5 shadow-2xs">
                              <Sparkles className="size-2.5" /> Best Value
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 my-2">
                        <div className="text-2xl font-heading font-extrabold text-[#2E3A2F]">
                          ₹{tier.price}
                          <span className="text-xs font-normal text-[#2E3A2F]/60">
                            /flat
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-[#2E3A2F]/85">
                          {rangeText}: ₹{tier.price}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#D9C9B2]/60 text-[10px] text-[#2E3A2F]/70 flex items-center justify-between">
                        <span>
                          {isActive
                            ? "Current active rate"
                            : participantCount < tier.minFlats
                            ? `${tier.minFlats - participantCount} more to unlock`
                            : "Unlocked"}
                        </span>
                        {tier.discountPercentage ? (
                          <span className="font-semibold text-[#6B7F5B]">
                            Save {tier.discountPercentage}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/60 text-xs text-[#2E3A2F]/80 flex items-center gap-2">
                <Info className="size-4 text-[#6B7F5B] shrink-0" />
                <span>
                  <strong>Society Guarantee:</strong> When the booking pool closes, every participating flat pays the final lowest unlocked price!
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Participant List Card: Grid of Flat numbers using shadcn Badges */}
        <section aria-labelledby="participants-list-title">
          <Card className="card-earthy border-[#D9C9B2] bg-white p-5 sm:p-6 shadow-xs">
            <CardHeader className="p-0 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle
                    id="participants-list-title"
                    className="text-base sm:text-lg font-heading font-bold text-[#2E3A2F] flex items-center gap-2"
                  >
                    <Building2 className="size-4 text-[#6B7F5B]" />
                    <span>Participant List ({participants.length} Flats Joined)</span>
                  </CardTitle>
                  <p className="text-xs text-[#2E3A2F]/70 mt-0.5">
                    Flats who have joined this society group booking pool.
                  </p>
                </div>
                <Badge className="bg-[#6B7F5B] text-[#F8F6EE] text-[10px] font-semibold">
                  {participants.length} Flats
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0 space-y-4">
              {participants.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="bg-[#F8F6EE] p-2 rounded-xl border border-[#D9C9B2]/60 text-center">
                    <p className="text-[10px] text-[#2E3A2F]/70 font-medium">Pending Service</p>
                    <p className="text-base font-bold text-[#C96F4F]">{pendingCount}</p>
                  </div>
                  <div className="bg-amber-50/70 p-2 rounded-xl border border-amber-200 text-center">
                    <p className="text-[10px] text-amber-900 font-medium">Awaiting Sign-off</p>
                    <p className="text-base font-bold text-amber-700">{awaitingCount}</p>
                  </div>
                  <div className="bg-emerald-50/70 p-2 rounded-xl border border-emerald-200 text-center">
                    <p className="text-[10px] text-emerald-900 font-medium">Verified Complete</p>
                    <p className="text-base font-bold text-emerald-700">{verifiedCount}</p>
                  </div>
                  <div className="bg-rose-50/70 p-2 rounded-xl border border-rose-200 text-center">
                    <p className="text-[10px] text-rose-900 font-medium">Issue Reported</p>
                    <p className="text-base font-bold text-rose-700">{issueCount}</p>
                  </div>
                </div>
              )}

              {participants.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-xl bg-[#F8F6EE]/60 border border-dashed border-[#D9C9B2] space-y-2">
                  <Users className="size-8 text-[#2E3A2F]/40 mx-auto" />
                  <p className="text-sm font-medium text-[#2E3A2F]">
                    No flats have joined this pool yet.
                  </p>
                  <p className="text-xs text-[#2E3A2F]/60 max-w-sm mx-auto">
                    Be the first flat in your society to join and kick off the group discount!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {participants.map((pt, idx) => (
                    <Badge
                      key={pt.id || idx}
                      variant="outline"
                      className="h-auto border-[#D9C9B2] bg-[#F8F6EE] hover:bg-[#E8E3D6] text-[#2E3A2F] py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs transition-colors"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className={`size-2 rounded-full shrink-0 ${
                            pt.service_status === "verified"
                              ? "bg-emerald-600"
                              : pt.service_status === "awaiting_confirmation"
                              ? "bg-amber-500"
                              : pt.service_status === "issue_reported"
                              ? "bg-rose-500"
                              : "bg-[#6B7F5B]"
                          }`}
                        />
                        <span className="truncate">{pt.flat_no || `Flat ${101 + idx}`}</span>
                      </div>
                      {pt.service_status === "verified" && (
                        <span title="Resident Verified">
                          <CheckCircle className="size-3 text-emerald-600 shrink-0" />
                        </span>
                      )}
                      {pt.service_status === "awaiting_confirmation" && (
                        <span title="Vendor Complete - Awaiting Sign-off">
                          <Clock className="size-3 text-amber-600 shrink-0" />
                        </span>
                      )}
                      {pt.service_status === "issue_reported" && (
                        <span title="Issue Reported">
                          <AlertTriangle className="size-3 text-rose-600 shrink-0" />
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Report Issue Dialog */}
        <Dialog open={isReportingIssue} onOpenChange={setIsReportingIssue}>
          <DialogContent className="sm:max-w-md bg-[#FAF9F5] border-[#D9C9B2] text-[#2E3A2F]">
            <DialogHeader>
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="size-5" />
                <DialogTitle className="font-heading font-bold text-lg text-[#2E3A2F]">
                  Report Service Issue
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-[#2E3A2F]/70">
                Flat {myParticipant?.flat_no} &bull; {event.title}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <p className="text-[#2E3A2F]/80">
                Please describe what was incomplete or unsatisfactory. Your note will be shared directly with the society secretary and {event.vendor_name || "the vendor"}.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="issue-note" className="font-semibold text-[#2E3A2F]">
                  Issue Description
                </label>
                <textarea
                  id="issue-note"
                  rows={3}
                  placeholder="e.g. AC cooling was not tested after servicing, or outdoor unit filter was left unwashed..."
                  value={issueText}
                  onChange={(e) => setIssueText(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#D9C9B2] bg-white text-xs text-[#2E3A2F] focus:outline-none focus:ring-1 focus:ring-[#C96F4F]"
                />
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmittingAction}
                onClick={() => {
                  setIsReportingIssue(false);
                  setIssueText("");
                }}
                className="border-[#D9C9B2] text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isSubmittingAction || !issueText.trim()}
                onClick={() => myParticipant && handleResidentReportIssue(myParticipant.id)}
                className="bg-rose-700 hover:bg-rose-800 text-white text-xs cursor-pointer flex items-center gap-1.5"
              >
                {isSubmittingAction && <Loader2 className="size-3.5 animate-spin" />}
                <span>Submit Issue Report</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>

      {/* Sticky Bottom Bar: 'Join Group Booking (₹XXX)' & WhatsApp Share Button */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#F8F6EE]/95 backdrop-blur-md border-t border-[#D9C9B2] shadow-xl p-3 sm:py-4 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-[#2E3A2F]/60 tracking-wider block">
              Current Society Rate
            </span>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xl sm:text-2xl font-heading font-extrabold text-[#2E3A2F]">
                ₹{pricing.currentPrice}
              </span>
              <span className="text-xs text-[#2E3A2F]/60">/flat</span>
              {pricing.originalPrice && pricing.originalPrice > pricing.currentPrice && (
                <span className="text-xs text-[#2E3A2F]/40 line-through ml-1">
                  ₹{pricing.originalPrice}
                </span>
              )}
              {pricing.savingsPerResident > 0 && (
                <span className="text-[11px] font-bold text-[#6B7F5B] bg-[#6B7F5B]/15 px-2 py-0.5 rounded-md ml-1">
                  Save ₹{pricing.savingsPerResident} ({pricing.savingsPercentage}%)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Share on WhatsApp Button */}
            <a
              href={getWhatsAppShareUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-semibold px-3 sm:px-4 py-2.5 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
              title="Share on WhatsApp with neighbors"
            >
              <MessageCircle className="size-4 fill-white text-white" />
              <span className="hidden sm:inline">Share on WhatsApp</span>
            </a>

            {/* Sticky Action: Either Resident Actions or Join Button */}
            {isResident ? (
              myParticipant ? (
                myParticipant.service_status === "awaiting_confirmation" ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      disabled={isSubmittingAction}
                      onClick={() => handleResidentVerify(myParticipant.id)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs px-3.5 sm:px-4 py-2.5 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      {isSubmittingAction ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3.5 text-emerald-200" />
                      )}
                      <span>Confirm Service</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSubmittingAction}
                      onClick={() => setIsReportingIssue(true)}
                      className="border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs px-3 sm:px-3.5 py-2.5 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <AlertTriangle className="size-3.5 text-rose-600" />
                      <span>Report Issue</span>
                    </Button>
                  </div>
                ) : myParticipant.service_status === "verified" ? (
                  <div className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold shrink-0">
                    <CheckCircle className="size-4 text-emerald-600" />
                    <span>Service Verified ({myParticipant.flat_no})</span>
                  </div>
                ) : myParticipant.service_status === "issue_reported" ? (
                  <div className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold shrink-0">
                    <AlertTriangle className="size-4 text-rose-600" />
                    <span>Issue Logged ({myParticipant.flat_no})</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl bg-[#E8E3D6] border border-[#D9C9B2] text-[#2E3A2F] text-xs font-semibold shrink-0">
                    <CheckCircle2 className="size-4 text-[#6B7F5B]" />
                    <span>Joined ({myParticipant.flat_no})</span>
                  </div>
                )
              ) : (
                <JoinButton
                  eventId={event.id}
                  currentPrice={pricing.currentPrice}
                  label={`Join Group Booking (₹${pricing.currentPrice})`}
                  disabledLabel={event.status === "cancelled" ? "Booking Cancelled" : "Pool Completed"}
                  disabled={event.status === "cancelled" || event.status === "completed"}
                  className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold text-xs sm:text-sm px-4 sm:px-6 py-2.5 rounded-xl shadow-xs transition-all active:scale-95 shrink-0"
                  onJoined={() => {
                    // Optimistic participant join
                    const randomFlat = `Flat ${Math.floor(Math.random() * 900 + 100)}`;
                    setParticipants((prev) => [
                      ...prev,
                      { id: crypto.randomUUID(), flat_no: randomFlat },
                    ]);
                  }}
                />
              )
            ) : (
              <Badge className="bg-[#2E3A2F] text-[#F8F6EE] text-xs font-semibold px-3 py-1.5 rounded-xl border-none">
                Vendor Portal
              </Badge>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
export default EventDetailClient;
