"use client";

import * as React from "react";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface JoinDialogProps {
  eventId: string;
  title: string;
  currentPrice: number;
  originalPrice?: number;
  unit: string; // e.g. "flat" or "car"
  joinedCount: number;
  targetCount: number;
  nextTierPrice?: number;
  nextTierRemaining?: number;
  societyName?: string;
  userFlat?: string;
  className?: string;
}

export function JoinButton({
  eventId,
  title,
  currentPrice,
  originalPrice,
  unit,
  joinedCount,
  targetCount,
  nextTierPrice,
  nextTierRemaining,
  societyName = "Palm Meadows",
  userFlat = "B-402",
  className,
}: JoinDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [isJoined, setIsJoined] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleJoin = async () => {
    setIsLoading(true);
    // Simulate short network delay
    await new Promise((resolve) => setTimeout(resolve, 600));
    setIsLoading(false);
    setIsJoined(true);
    setOpen(false);

    toast.success(`Booking Confirmed for ${userFlat}!`, {
      description: `You've joined ${title} at ₹${currentPrice}/${unit}. If ${nextTierRemaining ?? "more"} neighbors join, price drops automatically!`,
      duration: 5000,
    });
  };

  return (
    <>
      <Button
        data-event-id={eventId}
        onClick={() => setOpen(true)}
        className={`w-full sm:w-auto font-semibold px-5 py-2.5 rounded-xl shadow-xs transition-all active:scale-[0.98] ${
          isJoined
            ? "bg-[#6B7F5B] hover:bg-[#5b6d4d] text-[#F8F6EE]"
            : "bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE]"
        } ${className ?? ""}`}
      >
        {isJoined ? (
          <>
            <CheckCircle2 className="size-4 mr-1.5" />
            Joined (Flat {userFlat})
          </>
        ) : (
          "Join & Pay"
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-white border border-[#D9C9B2] rounded-2xl p-6 text-[#2E3A2F]">
          <DialogHeader className="gap-1.5 text-left">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#C96F4F]">
              <Sparkles className="size-3.5" /> Group Pool Booking
            </div>
            <DialogTitle className="text-xl font-heading font-semibold text-[#2E3A2F]">
              {title}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#2E3A2F]/70">
              {societyName} • Confirmed for Flat {userFlat}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {/* Price Box */}
            <div className="bg-[#F8F6EE] border border-[#D9C9B2] rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#2E3A2F]/70 font-medium">Locked Group Price</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-bold text-[#2E3A2F]">
                    ₹{currentPrice}
                  </span>
                  <span className="text-xs text-[#2E3A2F]/70">/{unit}</span>
                  {originalPrice && (
                    <span className="text-sm line-through text-[#6B7F5B] font-medium">
                      ₹{originalPrice}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-[#6B7F5B]/15 text-[#2E3A2F]">
                  {joinedCount}/{targetCount} Joined
                </span>
              </div>
            </div>

            {/* Next tier incentive callout */}
            {nextTierPrice && nextTierRemaining && (
              <div className="text-xs bg-[#C96F4F]/10 border border-[#C96F4F]/25 text-[#2E3A2F] rounded-lg p-3 flex items-start gap-2">
                <span className="font-semibold text-[#C96F4F]">Pool Bonus:</span>
                <span>
                  When {nextTierRemaining} more flats join, price drops to{" "}
                  <strong>₹{nextTierPrice}/{unit}</strong> for everyone!
                </span>
              </div>
            )}

            {/* Society Guarantee */}
            <div className="flex items-center gap-2 text-xs text-[#2E3A2F]/80">
              <ShieldCheck className="size-4 text-[#6B7F5B] shrink-0" />
              <span>Verified vendors • Pay securely • Society-managed quality</span>
            </div>
          </div>

          <DialogFooter className="mt-2 flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-[#D9C9B2] text-[#2E3A2F] hover:bg-[#E8E3D6]/50 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleJoin}
              disabled={isLoading}
              className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold rounded-xl flex-1"
            >
              {isLoading ? "Processing..." : `Confirm & Pay ₹${currentPrice}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
