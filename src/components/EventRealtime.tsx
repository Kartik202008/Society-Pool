"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  Calendar,
  Sparkles,
  Clock,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { calculateEventPricing } from "@/lib/pricing";
import { JoinButton } from "@/components/JoinButton";
import type { PriceTier } from "@/types";

export interface EventRealtimeProps {
  eventId: string;
  initialParticipantCount: number;
  priceTiers: PriceTier[];
  minParticipants?: number;
  maxParticipants?: number | null;
  formattedSlotTime?: string;
  unit?: string;
  className?: string;
  status?: string;
  userParticipant?: {
    id: string;
    flat_no: string;
    service_status?: string;
    issue_description?: string | null;
  } | null;
}

export function EventRealtime({
  eventId,
  initialParticipantCount,
  priceTiers,
  minParticipants = 10,
  maxParticipants,
  formattedSlotTime = "Slots available this weekend",
  unit = "flat",
  className = "",
  status = "open",
  userParticipant = null,
}: EventRealtimeProps) {
  const [eventStatus, setEventStatus] = React.useState(status);
  const [participantCount, setParticipantCount] = React.useState(
    initialParticipantCount
  );
  const [prevInitialCount, setPrevInitialCount] = React.useState(
    initialParticipantCount
  );

  // Sync if initial count from server updates and is higher
  if (prevInitialCount !== initialParticipantCount) {
    setPrevInitialCount(initialParticipantCount);
    if (initialParticipantCount > participantCount) {
      setParticipantCount(initialParticipantCount);
    }
  }

  // Calculate pricing based on current participant count
  const pricing = React.useMemo(() => {
    return calculateEventPricing(
      participantCount,
      priceTiers,
      minParticipants,
      maxParticipants
    );
  }, [participantCount, priceTiers, minParticipants, maxParticipants]);

  // Keep ref of last price to detect price drops
  const previousPriceRef = React.useRef<number>(pricing.currentPrice);

  // Track processed participant IDs and optimistic joins to prevent double counting
  const processedParticipantIdsRef = React.useRef<Set<string>>(new Set());
  const optimisticPendingJoinsRef = React.useRef<number>(0);

  // Function to process a participant count increment and check for price drops
  const recordParticipantJoined = React.useCallback(
    (participantId?: string) => {
      if (participantId) {
        if (processedParticipantIdsRef.current.has(participantId)) {
          return;
        }
        processedParticipantIdsRef.current.add(participantId);
      }

      setParticipantCount((prevCount) => {
        const nextCount = prevCount + 1;
        const newPricing = calculateEventPricing(
          nextCount,
          priceTiers,
          minParticipants,
          maxParticipants
        );

        // Check if price dropped compared to previous price
        if (newPricing.currentPrice < previousPriceRef.current) {
          const dropDetail =
            newPricing.nextTierNeeded && newPricing.nextTierPrice
              ? `${newPricing.nextTierNeeded} more needed for ₹${newPricing.nextTierPrice}!`
              : "Maximum society discount unlocked!";

          toast.success(
            `🎉 Price dropped to ₹${newPricing.currentPrice}! ${dropDetail}`,
            {
              duration: 5000,
              className: "border-[#D9C9B2] bg-[#F8F6EE] text-[#2E3A2F]",
            }
          );

          previousPriceRef.current = newPricing.currentPrice;
        }

        return nextCount;
      });
    },
    [priceTiers, minParticipants, maxParticipants]
  );

  // Subscribe to Supabase Realtime for participants table filtered by eventId
  React.useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`realtime-participants-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "participants",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const newRow = payload.new as { id?: string; event_id?: string };
          const rowId = newRow?.id;

          // If this was an optimistic join from this browser tab, consume it
          if (optimisticPendingJoinsRef.current > 0) {
            optimisticPendingJoinsRef.current -= 1;
            if (rowId) {
              processedParticipantIdsRef.current.add(rowId);
            }
            return;
          }

          recordParticipantJoined(rowId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
          filter: `id=eq.${eventId}`,
        },
        (payload) => {
          const updated = payload.new as { status?: string };
          if (updated?.status) {
            setEventStatus(updated.status);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Connected to realtime participants channel
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, recordParticipantJoined]);

  // Optimistic handler when current user clicks Join in this client
  const handleOptimisticJoin = React.useCallback(() => {
    optimisticPendingJoinsRef.current += 1;
    recordParticipantJoined();
  }, [recordParticipantJoined]);

  const target = pricing.targetCount;
  const progressPercent = Math.min(
    100,
    target > 0 ? Math.max(0, Math.round((participantCount / target) * 100)) : 0
  );

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ========================================================================= */}
      {/* 1. PROGRESS SECTION (Animated with Framer Motion)                        */}
      {/* ========================================================================= */}
      <div className="space-y-2 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/60 p-3">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-[#2E3A2F] flex items-center gap-1.5">
            <Users className="size-3.5 text-[#6B7F5B]" />
            <span className="flex items-center gap-1">
              <motion.span
                key={participantCount}
                initial={{ scale: 1.3, color: "#C96F4F" }}
                animate={{ scale: 1, color: "#2E3A2F" }}
                transition={{ duration: 0.3 }}
                className="font-bold inline-block"
              >
                {participantCount}
              </motion.span>
              <span>
                /{target} {unit}s joined
              </span>
            </span>
          </span>

          <motion.span
            key={progressPercent}
            initial={{ scale: 1.15 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
            className="text-[#C96F4F] font-bold flex items-center gap-1"
          >
            <span>{progressPercent}% Unlocked</span>
            {progressPercent >= 100 && (
              <Sparkles className="size-3 text-[#C96F4F]" />
            )}
          </motion.span>
        </div>

        {/* Framer Motion Animated Progress Bar */}
        <div
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${participantCount} of ${target} ${unit}s joined`}
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#E8E3D6]"
        >
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#C96F4F] to-[#B85A3A]"
            initial={{ width: `${progressPercent}%` }}
            animate={{ width: `${progressPercent}%` }}
            transition={{
              type: "spring",
              stiffness: 90,
              damping: 14,
              mass: 0.6,
            }}
          />
        </div>

        {/* Progress Text & Slot Time */}
        <div className="flex items-center justify-between text-xs pt-0.5 flex-wrap gap-1">
          <AnimatePresence mode="wait">
            <motion.p
              key={pricing.progressText}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.2 }}
              className="font-semibold text-[#C96F4F]"
            >
              {pricing.progressText}
            </motion.p>
          </AnimatePresence>

          <span className="text-[11px] text-[#2E3A2F]/60 flex items-center gap-1">
            <Calendar className="size-3" />
            {formattedSlotTime}
          </span>
        </div>
      </div>

      {/* Action Required Banner for resident flat awaiting sign-off */}
      {userParticipant?.service_status === "awaiting_confirmation" && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-center justify-between gap-2 animate-pulse">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-amber-600 shrink-0" />
            <span>
              Vendor completed service for <strong>{userParticipant.flat_no}</strong>. Awaiting your sign-off!
            </span>
          </div>
          <Link
            href={`/event/${eventId}`}
            className="inline-flex items-center gap-1 font-bold text-amber-900 hover:text-amber-950 underline shrink-0"
          >
            <span>Review</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. FOOTER ROW: Dynamic Price & Join Button / Resident Action              */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between pt-1 border-t border-[#D9C9B2]/50 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-baseline gap-2">
            <motion.span
              key={pricing.currentPrice}
              initial={{ scale: 1.2, color: "#C96F4F" }}
              animate={{ scale: 1, color: "#2E3A2F" }}
              transition={{ type: "spring", stiffness: 350, damping: 20 }}
              className="text-xl sm:text-2xl font-bold font-heading text-[#2E3A2F]"
            >
              ₹{pricing.currentPrice}
            </motion.span>
            <span className="text-xs font-medium text-[#2E3A2F]/70">
              /{unit}
            </span>
            {pricing.originalPrice && pricing.originalPrice > pricing.currentPrice && (
              <span className="text-xs sm:text-sm line-through text-[#2E3A2F]/40 font-medium">
                ₹{pricing.originalPrice}
              </span>
            )}
          </div>
          {pricing.savingsPerResident > 0 && (
            <motion.span
              key={pricing.savingsPerResident}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#6B7F5B]/15 text-[#6B7F5B]"
            >
              Save ₹{pricing.savingsPerResident} ({pricing.savingsPercentage}%)
            </motion.span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile Details button ensuring prominent, predictable navigation on mobile screens */}
          <Link
            href={`/event/${eventId}`}
            onClick={(e) => e.stopPropagation()}
            className="sm:hidden"
          >
            <Button
              variant="outline"
              size="sm"
              className="border-[#D9C9B2] text-[#2E3A2F] text-xs h-8 px-2.5 rounded-xl hover:bg-[#FAF9F5] flex items-center gap-1 cursor-pointer"
            >
              <span>Details</span>
              <ChevronRight className="size-3.5 text-[#C96F4F]" />
            </Button>
          </Link>

          {userParticipant ? (
            userParticipant.service_status === "awaiting_confirmation" ? (
              <Link href={`/event/${eventId}`} onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 transition-all active:scale-95 animate-pulse"
                >
                  <Clock className="size-3.5" />
                  <span>Confirm Service (Flat {userParticipant.flat_no})</span>
                </Button>
              </Link>
            ) : userParticipant.service_status === "verified" ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold">
                <CheckCircle className="size-3.5 text-emerald-600" />
                <span>Service Verified ({userParticipant.flat_no})</span>
              </div>
            ) : userParticipant.service_status === "issue_reported" ? (
              <Link href={`/event/${eventId}`} onClick={(e) => e.stopPropagation()}>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold hover:bg-rose-100 transition-colors cursor-pointer">
                  <AlertTriangle className="size-3.5 text-rose-600" />
                  <span>Issue Logged ({userParticipant.flat_no})</span>
                </div>
              </Link>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E8E3D6] border border-[#D9C9B2] text-[#2E3A2F] text-xs font-semibold">
                <CheckCircle2 className="size-3.5 text-[#6B7F5B]" />
                <span>Joined ({userParticipant.flat_no})</span>
              </div>
            )
          ) : (
            <JoinButton
              eventId={eventId}
              currentPrice={pricing.currentPrice}
              onJoined={handleOptimisticJoin}
              disabled={eventStatus === "cancelled"}
              disabledLabel="Booking Cancelled"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default EventRealtime;
