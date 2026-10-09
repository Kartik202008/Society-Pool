"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface JoinButtonProps {
  eventId: string;
  currentPrice: number;
  label?: string;
  disabledLabel?: string;
  className?: string;
  disabled?: boolean;
  initialIsJoined?: boolean;
  userFlatNo?: string;
  onJoined?: () => void;
}

export function JoinButton({
  eventId,
  currentPrice,
  label,
  disabledLabel,
  className,
  disabled = false,
  initialIsJoined = false,
  userFlatNo,
  onJoined,
}: JoinButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);
  const [isJoined, setIsJoined] = React.useState(initialIsJoined);
  const [lastJoinedFlat, setLastJoinedFlat] = React.useState<string | null>(
    userFlatNo ?? null
  );

  // Concurrency guard to prevent rapid clicks and simultaneous submissions
  const isSubmittingRef = React.useRef(false);

  // Check whether the authenticated user is already a participant on mount or event change
  React.useEffect(() => {
    let isMounted = true;

    const checkExistingParticipant = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data: existing, error } = await supabase
          .from("participants")
          .select("id, flat_no")
          .eq("event_id", eventId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (isMounted && existing && !error) {
          setIsJoined(true);
          if (existing.flat_no) {
            setLastJoinedFlat(existing.flat_no);
          }
        }
      } catch {
        // Silently ignore mount check network errors
      }
    };

    checkExistingParticipant();

    return () => {
      isMounted = false;
    };
  }, [eventId]);

  const handleJoin = async () => {
    // 1. Guard against in-flight requests, disabled state, or concurrent calls
    if (isLoading || isSubmittingRef.current || disabled) return;

    // 2. If already marked as joined, notify the user gently and avoid duplicate DB work
    if (isJoined) {
      toast.info("You're already part of this group booking.");
      return;
    }

    isSubmittingRef.current = true;
    setIsLoading(true);

    const supabase = createClient();
    let finalUserId = crypto.randomUUID();
    let finalFlatNo = `Flat ${Math.floor(Math.random() * 900 + 100)}`;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        finalUserId = user.id;

        // 3. Pre-check: Verify in database whether this user is already a participant
        const { data: existing, error: checkError } = await supabase
          .from("participants")
          .select("id, flat_no")
          .eq("event_id", eventId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing && !checkError) {
          setIsJoined(true);
          if (existing.flat_no) setLastJoinedFlat(existing.flat_no);
          toast.info("You're already part of this group booking.");
          router.refresh();
          return;
        }

        finalFlatNo =
          user.user_metadata?.flat_no ||
          (await supabase
            .from("users")
            .select("flat_no")
            .eq("id", user.id)
            .single()
            .then((res) => res.data?.flat_no)) ||
          "B-402";
      }

      // 4. Attempt insert into participants table
      const { error } = await supabase.from("participants").insert({
        event_id: eventId,
        user_id: finalUserId,
        flat_no: finalFlatNo,
      });

      if (error) {
        // 5. Check if error is PostgreSQL 23505 unique constraint violation
        const isDuplicateKey =
          error.code === "23505" ||
          String(error.code).includes("23505") ||
          error.message?.includes("23505") ||
          error.message?.includes("duplicate key value violates unique constraint") ||
          error.message?.includes("participants_event_id_user_id_key") ||
          (error as { details?: string }).details?.includes("already exists");

        if (isDuplicateKey) {
          setIsJoined(true);
          setLastJoinedFlat(finalFlatNo);
          toast.info("You're already part of this group booking.");
          router.refresh();
          return;
        }

        console.error("Error joining event:", JSON.stringify(error, null, 2));
        toast.error(error.message || "Failed to join event");
        return;
      }

      // 6. Success: New unique participant registered
      setLastJoinedFlat(finalFlatNo);
      setIsJoined(true);
      toast.success("✅ You joined! Price will drop as more neighbors join.");
      onJoined?.();

      // Safely record notification for user via trusted server function
      try {
        await supabase.rpc("notify_booking_joined", {
          p_event_id: eventId,
          p_flat_no: finalFlatNo,
        });
      } catch {
        // Silently continue if notifications table/function is not yet migrated
      }

      // Refresh server components to update participant counts & price tiers
      router.refresh();
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string; details?: string };
      const isDuplicateKey =
        err?.code === "23505" ||
        String(err?.code).includes("23505") ||
        err?.message?.includes("23505") ||
        err?.message?.includes("duplicate key value violates unique constraint") ||
        err?.message?.includes("participants_event_id_user_id_key") ||
        err?.details?.includes("already exists");

      if (isDuplicateKey) {
        setIsJoined(true);
        setLastJoinedFlat(finalFlatNo);
        toast.info("You're already part of this group booking.");
        router.refresh();
      } else {
        console.error("Error joining event:", JSON.stringify(error, null, 2));
        toast.error(err?.message || "Failed to join event");
      }
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <Button
      onClick={handleJoin}
      disabled={isLoading || disabled}
      aria-label={
        disabled
          ? disabledLabel || "Booking Cancelled"
          : isJoined
          ? `Already joined as ${lastJoinedFlat || "resident"}`
          : `Join and pay ₹${currentPrice} for event`
      }
      className={`font-semibold px-5 py-2 rounded-xl shadow-xs transition-all active:scale-[0.98] ${
        disabled
          ? "bg-[#D9C9B2]/60 hover:bg-[#D9C9B2]/60 text-[#2E3A2F]/50 cursor-not-allowed border border-[#D9C9B2]"
          : isJoined
          ? "bg-[#6B7F5B] hover:bg-[#5b6d4d] text-[#F8F6EE] cursor-pointer"
          : "bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] cursor-pointer"
      } ${className ?? ""}`}
    >
      {isLoading ? (
        <>
          <Loader2 className="size-4 animate-spin mr-1.5" />
          Joining...
        </>
      ) : isJoined ? (
        <>
          <CheckCircle2 className="size-4 mr-1.5" />
          Joined ({lastJoinedFlat || "You"})
        </>
      ) : disabled ? (
        disabledLabel || "Booking Cancelled"
      ) : (
        label || "Join & Pay"
      )}
    </Button>
  );
}

export default JoinButton;

