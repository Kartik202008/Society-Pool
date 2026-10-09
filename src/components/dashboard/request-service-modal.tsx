"use client";

import * as React from "react";
import { Sparkles, Send, Loader2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface RequestServiceModalProps {
  societyName?: string;
  residentName?: string;
  flatNo?: string;
  className?: string;
}

const SERVICE_OPTIONS = [
  "Pest Control",
  "Sofa Cleaning",
  "Painting",
  "Plumbing",
  "Other",
];

export function RequestServiceModal({
  societyName = "Palm Meadows",
  residentName = "Rahul Sharma",
  flatNo = "B-402",
  className,
}: RequestServiceModalProps) {
  const [open, setOpen] = React.useState(false);
  const [serviceName, setServiceName] = React.useState("Pest Control");
  const [description, setDescription] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // User state
  const [currentResident, setCurrentResident] = React.useState(residentName);
  const [currentFlat, setCurrentFlat] = React.useState(flatNo);

  // Fetch logged-in user profile if available
  React.useEffect(() => {
    async function loadCurrentUser() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: profile } = await supabase
            .from("users")
            .select("name, flat_no")
            .eq("id", user.id)
            .single();

          const name =
            profile?.name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            residentName;
          const flat = profile?.flat_no || user.user_metadata?.flat_no || flatNo;

          setCurrentResident(name);
          setCurrentFlat(flat);
        }
      } catch {
        // Fallback to props defaults
      }
    }

    if (open) {
      loadCurrentUser();
    }
  }, [open, residentName, flatNo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName) {
      toast.error("Please select a service name");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("service_requests").insert({
        resident_name: currentResident,
        flat_no: currentFlat,
        service_name: serviceName,
        description: description.trim() || null,
        status: "pending",
      });

      if (error) {
        console.error("Error inserting service_request:", error);
        // If table doesn't exist yet, provide helpful message
        if (error.message?.includes("does not exist") || error.code === "42P01") {
          toast.error("Database table 'service_requests' not found. Please run the SQL migration in Supabase SQL editor.");
        } else {
          toast.error(error.message || "Failed to submit request");
        }
        return;
      }

      toast.success("✅ Request submitted! Your secretary will review it.");
      setServiceName("Pest Control");
      setDescription("");
      setOpen(false);
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
      <Button
        onClick={() => setOpen(true)}
        className={`bg-[#6B7F5B] hover:bg-[#5b6d4d] text-[#F8F6EE] font-semibold px-5 py-2.5 rounded-xl shadow-xs transition-all active:scale-[0.98] cursor-pointer ${
          className ?? ""
        }`}
      >
        Request a Service
      </Button>

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
              Submit your request to Greenwood Management. When multiple flats show interest, your secretary will negotiate wholesale bulk vendor rates.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 my-2">
            {/* Resident & Flat badge info */}
            <div className="p-2.5 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/60 text-xs text-[#2E3A2F]/80 flex items-center justify-between">
              <span>
                Requesting for: <strong>{currentResident}</strong>
              </span>
              <span className="font-semibold text-[#C96F4F]">
                Flat {currentFlat}
              </span>
            </div>

            {/* Service Name (Select) */}
            <div className="space-y-1.5 text-left">
              <Label htmlFor="service-select" className="text-xs font-semibold text-[#2E3A2F]">
                Service Name
              </Label>
              <div className="relative">
                <select
                  id="service-select"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full text-sm rounded-xl border border-[#D9C9B2] bg-[#F8F6EE]/60 p-2.5 text-[#2E3A2F] focus:border-[#6B7F5B] focus:outline-none focus:ring-2 focus:ring-[#6B7F5B]/30 transition-all cursor-pointer font-medium"
                  required
                >
                  {SERVICE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description (Textarea) */}
            <div className="space-y-1.5 text-left">
              <Label htmlFor="description" className="text-xs font-semibold text-[#2E3A2F]">
                Description
              </Label>
              <textarea
                id="description"
                rows={3}
                placeholder="Tell your secretary what you need (e.g., 3BHK deep cleaning, balcony pest issues, preferred weekend slots)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-sm rounded-xl border border-[#D9C9B2] bg-[#F8F6EE]/60 p-2.5 text-[#2E3A2F] focus:border-[#6B7F5B] focus:outline-none focus:ring-2 focus:ring-[#6B7F5B]/30 transition-all resize-none placeholder:text-[#2E3A2F]/40"
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
