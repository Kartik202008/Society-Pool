"use client";

import * as React from "react";
import { Sparkles, Send, Loader2, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { cn } from "cn";

export interface RequestServiceDialogProps {
  societyName?: string;
  className?: string;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export const SERVICE_OPTIONS = [
  "Pest Control",
  "Sofa Cleaning",
  "Painting",
  "Plumbing",
  "Electrical",
  "Other",
] as const;

export const TIME_SLOT_OPTIONS = [
  "Morning (9:00 AM - 12:00 PM)",
  "Afternoon (12:00 PM - 4:00 PM)",
  "Evening (4:00 PM - 7:00 PM)",
  "Flexible / Anytime",
] as const;

export function RequestServiceDialog({
  societyName = "Palm Meadows",
  className,
  trigger,
  onSuccess,
}: RequestServiceDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [serviceName, setServiceName] = React.useState<string>("Pest Control");
  const [preferredDate, setPreferredDate] = React.useState("This Weekend");
  const [preferredTime, setPreferredTime] = React.useState<string>(TIME_SLOT_OPTIONS[0]);
  const [description, setDescription] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName) {
      toast.error("Please select a service name");
      return;
    }

    setIsSubmitting(true);
    try {
      const details = [
        preferredDate ? `Preferred Date: ${preferredDate}` : "",
        preferredTime ? `Time: ${preferredTime}` : "",
        description.trim() ? `Note: ${description.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" • ");

      const supabase = createClient();
      const { error } = await supabase.from("service_requests").insert({
        resident_name: "Rahul Sharma",
        flat_no: "B-402",
        service_name: serviceName,
        description: details || null,
        status: "pending",
      });

      if (error) {
        console.error("Error inserting service_request:", error);
        toast.error(error.message || "Failed to submit request");
        return;
      }

      toast.success("✅ Request submitted! Your secretary will review it.");
      setServiceName("Pest Control");
      setPreferredDate("This Weekend");
      setPreferredTime(TIME_SLOT_OPTIONS[0]);
      setDescription("");
      setOpen(false);
      onSuccess?.();
    } catch (err: unknown) {
      console.error("Submit request error:", err);
      const e = err as { message?: string };
      toast.error(e?.message || "Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {trigger ? (
        <div onClick={() => setOpen(true)} className="inline-block cursor-pointer">
          {trigger}
        </div>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          className={cn(
            "bg-[#6B7F5B] hover:bg-[#5b6d4d] text-[#F8F6EE] font-semibold px-5 py-2.5 rounded-xl shadow-xs transition-all active:scale-[0.98] cursor-pointer",
            className
          )}
        >
          Request a Service
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-white border border-[#D9C9B2] rounded-2xl p-6 text-[#2E3A2F]">
          <DialogHeader className="gap-1 text-left">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B7F5B]">
              <Sparkles className="size-3.5" /> Society Bulk Demand
            </div>
            <DialogTitle className="text-xl font-heading font-bold text-[#2E3A2F]">
              Request a Service
            </DialogTitle>
            <DialogDescription className="text-xs text-[#2E3A2F]/70">
              Submit your request to {societyName} management. When multiple flats show interest, your secretary will negotiate wholesale bulk vendor rates.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 my-2">
            {/* Resident & Flat badge info */}
            <div className="p-2.5 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/60 text-xs text-[#2E3A2F]/80 flex items-center justify-between">
              <span>
                Requesting for: <strong>Rahul Sharma</strong>
              </span>
              <span className="font-semibold text-[#C96F4F]">
                Flat B-402
              </span>
            </div>

            {/* Service Name (shadcn Select) */}
            <div className="space-y-1.5 text-left">
              <Label htmlFor="service-select" className="text-xs font-semibold text-[#2E3A2F]">
                Service Name
              </Label>
              <Select
                value={serviceName}
                onValueChange={(val) => {
                  if (val) setServiceName(val);
                }}
              >
                <SelectTrigger
                  id="service-select"
                  className="w-full h-10 rounded-xl border border-[#D9C9B2] bg-[#F8F6EE]/60 px-3 text-sm text-[#2E3A2F] focus:border-[#6B7F5B] focus:ring-2 focus:ring-[#6B7F5B]/30 font-medium justify-between"
                >
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-[#D9C9B2] rounded-xl shadow-lg z-50">
                  {SERVICE_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt}
                      value={opt}
                      className="cursor-pointer text-sm py-2 px-3 hover:bg-[#F8F6EE] focus:bg-[#F8F6EE] text-[#2E3A2F]"
                    >
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preferred Date & Preferred Time Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-left">
                <Label htmlFor="preferred-date" className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1">
                  <Calendar className="size-3 text-[#6B7F5B]" /> Preferred Date
                </Label>
                <Input
                  id="preferred-date"
                  type="text"
                  placeholder="e.g. This Saturday"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="h-10 rounded-xl border border-[#D9C9B2] bg-[#F8F6EE]/60 px-3 text-sm text-[#2E3A2F] focus-visible:ring-[#6B7F5B]/30 font-medium"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <Label htmlFor="preferred-time" className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1">
                  <Clock className="size-3 text-[#6B7F5B]" /> Preferred Time
                </Label>
                <Select
                  value={preferredTime}
                  onValueChange={(val) => {
                    if (val) setPreferredTime(val);
                  }}
                >
                  <SelectTrigger
                    id="preferred-time"
                    className="w-full h-10 rounded-xl border border-[#D9C9B2] bg-[#F8F6EE]/60 px-2.5 text-xs text-[#2E3A2F] focus:border-[#6B7F5B] focus:ring-2 focus:ring-[#6B7F5B]/30 font-medium justify-between"
                  >
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-[#D9C9B2] rounded-xl shadow-lg z-50">
                    {TIME_SLOT_OPTIONS.map((slot) => (
                      <SelectItem
                        key={slot}
                        value={slot}
                        className="cursor-pointer text-xs py-2 px-3 hover:bg-[#F8F6EE] focus:bg-[#F8F6EE] text-[#2E3A2F]"
                      >
                        {slot}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Optional Note (shadcn Textarea) */}
            <div className="space-y-1.5 text-left">
              <Label htmlFor="description" className="text-xs font-semibold text-[#2E3A2F]">
                Optional Note
              </Label>
              <Textarea
                id="description"
                rows={2}
                placeholder="Specific requirements (e.g. 3BHK deep cleaning, balcony painting)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-[#D9C9B2] bg-[#F8F6EE]/60 p-2.5 text-sm text-[#2E3A2F] placeholder:text-[#2E3A2F]/40 focus:border-[#6B7F5B] focus:ring-2 focus:ring-[#6B7F5B]/30 resize-none font-normal"
              />
            </div>

            <DialogFooter className="mt-2 flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="border-[#D9C9B2] text-[#2E3A2F] hover:bg-[#E8E3D6]/50 rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold rounded-xl text-xs flex-1 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="size-3.5 mr-1.5" />
                    Submit Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default RequestServiceDialog;
