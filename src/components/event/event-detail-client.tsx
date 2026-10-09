"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Building2,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  Share2,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  TrendingDown,
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  Tag,
  Star,
  Info,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JoinButton } from "@/components/JoinButton";
import {
  parsePriceTiers,
  calculateEventPricing,
  formatSlotTime,
} from "@/lib/pricing";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { DatabaseEventRow, PriceTier } from "@/types";

export interface EventParticipant {
  id: string;
  flat_no: string;
  user_id?: string;
  joined_at?: string;
}

export interface EventDetailClientProps {
  event: DatabaseEventRow & {
    participants?: EventParticipant[];
  };
}

export function EventDetailClient({ event: initialEvent }: EventDetailClientProps) {
  const [event, setEvent] = React.useState(initialEvent);
  const [participants, setParticipants] = React.useState<EventParticipant[]>(
    initialEvent.participants || []
  );
  const [copiedLink, setCopiedLink] = React.useState(false);

  // Subscribe to realtime participant joins for this specific event
  React.useEffect(() => {
    const supabase = createClient();
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [event.id]);

  const participantCount = participants.length;
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

            <CardContent className="p-0">
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
                      className="h-auto border-[#D9C9B2] bg-[#F8F6EE] hover:bg-[#E8E3D6] text-[#2E3A2F] py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-2xs transition-colors"
                    >
                      <span className="size-2 rounded-full bg-[#6B7F5B] shrink-0" />
                      <span className="truncate">{pt.flat_no || `Flat ${101 + idx}`}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
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

            {/* Sticky Join Button: 'Join Group Booking (₹XXX)' */}
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
          </div>
        </div>
      </footer>
    </div>
  );
}
export default EventDetailClient;
