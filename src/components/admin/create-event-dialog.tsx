"use client";

import * as React from "react";
import {
  Plus,
  Trash2,
  Clock,
  Building2,
  Tag,
  Sparkles,
  Users,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import type { PriceTier } from "@/types";

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventCreated?: (newEvent: Record<string, unknown>) => void;
  initialServiceType?: string;
  initialTitle?: string;
  requestIdToApprove?: string | null;
}

const SERVICE_TYPE_PRESETS = [
  { label: "AC Servicing", defaultTitle: "AC Deep Cleaning & Gas Refill", vendor: "CoolCare Express" },
  { label: "Deep Cleaning", defaultTitle: "Society Home Deep Cleaning", vendor: "Sparkle Cleaners" },
  { label: "Car Wash", defaultTitle: "Monsoon Society Car Wash & Detailing", vendor: "AutoShine Express" },
  { label: "Pest Control", defaultTitle: "Complete Pest & Termite Control", vendor: "PestBusters India" },
  { label: "Sofa Cleaning", defaultTitle: "Sofa & Mattress Steam Shampoo", vendor: "CleanLiving Services" },
  { label: "RO Service", defaultTitle: "RO Water Purifier Filter Service", vendor: "AquaPure Solutions" },
  { label: "Painting", defaultTitle: "Balcony & Wall Touch-up Painting", vendor: "ColorCraft Painters" },
  { label: "Plumbing", defaultTitle: "Society Bulk Plumbing & Leak Fix", vendor: "QuickFix Plumbers" },
  { label: "Other", defaultTitle: "Society Bulk Home Service", vendor: "Verified Society Partner" },
];

function toIsoSlotTime(input: string): string {
  const d = new Date(input);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  const now = new Date();
  const lower = (input || "").toLowerCase();
  const target = new Date();

  if (lower.includes("sun")) {
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    target.setDate(now.getDate() + daysUntilSunday);
    target.setHours(11, 0, 0, 0);
  } else if (lower.includes("next weekend")) {
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
    target.setDate(now.getDate() + daysUntilSaturday + 7);
    target.setHours(10, 0, 0, 0);
  } else {
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
    target.setDate(now.getDate() + daysUntilSaturday);
    target.setHours(10, 0, 0, 0);
  }

  return target.toISOString();
}

export function CreateEventDialog({
  open,
  onOpenChange,
  onEventCreated,
  initialServiceType,
  initialTitle,
  requestIdToApprove,
}: CreateEventDialogProps) {
  const [serviceType, setServiceType] = React.useState("AC Servicing");
  const [title, setTitle] = React.useState("AC Deep Cleaning & Gas Refill");
  const [slotTime, setSlotTime] = React.useState("This Saturday • 10:00 AM - 2:00 PM");
  const [vendorName, setVendorName] = React.useState("CoolCare Express");
  const [minParticipants, setMinParticipants] = React.useState<number>(5);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [prevSyncKey, setPrevSyncKey] = React.useState<string | null>(null);

  // Sync initial values when opened from a resident request approval using React state-adjustment pattern
  const currentSyncKey = open && initialServiceType ? `${open}-${initialServiceType}-${initialTitle || ""}` : null;
  if (open && initialServiceType && currentSyncKey !== prevSyncKey) {
    setPrevSyncKey(currentSyncKey);
    setServiceType(initialServiceType);
    setTitle(initialTitle || `${initialServiceType} Group Booking`);
    const matchedPreset = SERVICE_TYPE_PRESETS.find(
      (p) => p.label.toLowerCase() === initialServiceType.toLowerCase()
    );
    if (matchedPreset) {
      setVendorName(matchedPreset.vendor);
    }
  }

  // Dynamic Price Tiers state
  const [priceTiers, setPriceTiers] = React.useState<PriceTier[]>([
    { minFlats: 1, maxFlats: 5, price: 499 },
    { minFlats: 6, maxFlats: 15, price: 399 },
    { minFlats: 16, maxFlats: 999, price: 299 },
  ]);

  // Handle Preset selection
  const handleSelectPreset = (preset: (typeof SERVICE_TYPE_PRESETS)[0]) => {
    setServiceType(preset.label);
    if (!title || SERVICE_TYPE_PRESETS.some((p) => p.defaultTitle === title)) {
      setTitle(preset.defaultTitle);
    }
    if (!vendorName || SERVICE_TYPE_PRESETS.some((p) => p.vendor === vendorName)) {
      setVendorName(preset.vendor);
    }
  };

  // Tier operations
  const handleAddTier = () => {
    const lastTier = priceTiers[priceTiers.length - 1];
    const newMin = lastTier ? (lastTier.maxFlats ? lastTier.maxFlats + 1 : lastTier.minFlats + 10) : 1;
    const newMax = newMin + 10;
    const newPrice = lastTier ? Math.max(99, Math.round(lastTier.price * 0.8)) : 399;

    setPriceTiers((prev) => [
      ...prev,
      {
        minFlats: newMin,
        maxFlats: newMax,
        price: newPrice,
      },
    ]);
  };

  const handleRemoveTier = (index: number) => {
    if (priceTiers.length <= 1) {
      toast.error("At least one price tier is required.");
      return;
    }
    setPriceTiers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTierChange = (
    index: number,
    field: "minFlats" | "maxFlats" | "price",
    value: number
  ) => {
    setPriceTiers((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      return updated;
    });
  };

  // Form submission: Insert into Supabase events table
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Please provide an event title");
      return;
    }
    if (!serviceType.trim()) {
      toast.error("Please enter or select a service type");
      return;
    }
    if (!vendorName.trim()) {
      toast.error("Please specify a vendor name");
      return;
    }
    if (!slotTime.trim()) {
      toast.error("Please set the slot timing");
      return;
    }

    // Validate price tiers
    const validTiers = priceTiers.map((t) => ({
      minFlats: Number(t.minFlats) || 1,
      maxFlats: t.maxFlats ? Number(t.maxFlats) : 999,
      price: Number(t.price) || 0,
    }));

    if (validTiers.some((t) => t.price <= 0)) {
      toast.error("All price tiers must have a price greater than ₹0");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const eventPayload = {
        service_type: serviceType.trim(),
        title: title.trim(),
        slot_time: toIsoSlotTime(slotTime),
        vendor_name: vendorName.trim(),
        min_participants: Number(minParticipants) || 5,
        max_participants: null,
        price_tiers: validTiers,
      };

      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventPayload),
      });

      const json = await res.json();

      if (!res.ok) {
        console.error("Error creating event via /api/events:", json);
        toast.error(json.error || "Failed to create group booking");
        return;
      }

      const data = json.data;

      // If this event was triggered from a resident request, update request status to approved
      if (requestIdToApprove) {
        try {
          await supabase
            .from("service_requests")
            .update({ status: "approved" })
            .eq("id", requestIdToApprove);
        } catch (e) {
          console.error("Error updating service request status:", e);
        }
      }

      toast.success("Group booking created successfully!", {
        description: `"${title}" is now open for society residents to join.`,
        duration: 5000,
      });

      onEventCreated?.(data);
      onOpenChange(false);

      // Reset form to defaults
      setTitle("AC Deep Cleaning & Gas Refill");
      setServiceType("AC Servicing");
      setVendorName("CoolCare Express");
      setSlotTime("This Saturday • 10:00 AM - 2:00 PM");
      setMinParticipants(5);
      setPriceTiers([
        { minFlats: 1, maxFlats: 5, price: 499 },
        { minFlats: 6, maxFlats: 15, price: 399 },
        { minFlats: 16, maxFlats: 999, price: 299 },
      ]);
    } catch (err: unknown) {
      console.error("Unexpected error submitting event:", err);
      const errorObj = err as { message?: string };
      toast.error(errorObj?.message || "Failed to create group booking");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border border-[#D9C9B2] rounded-2xl p-6 text-[#2E3A2F] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="gap-1.5 text-left pb-2 border-b border-[#E8E3D6]">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#C96F4F]">
            <Sparkles className="size-3.5" /> Society Secretary Portal
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-heading font-bold text-[#2E3A2F]">
            Create Group Booking Event
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-[#2E3A2F]/70">
            Configure dynamic volume discounts with verified vendors for Greenwood Society flats.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 my-2">
          {/* Service Category Presets */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-[#2E3A2F] uppercase tracking-wider">
              Service Type Presets
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_TYPE_PRESETS.map((preset) => {
                const isSelected = serviceType === preset.label;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#2E3A2F] text-[#F8F6EE] border-[#2E3A2F] font-semibold shadow-xs"
                        : "bg-[#F8F6EE] text-[#2E3A2F] border-[#D9C9B2] hover:bg-[#E8E3D6]"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Service Type & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="service-type" className="text-xs font-semibold text-[#2E3A2F]">
                Service Type <span className="text-[#C96F4F]">*</span>
              </Label>
              <Input
                id="service-type"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                placeholder="e.g. AC Servicing, Pest Control"
                className="border-[#D9C9B2] focus-visible:border-[#6B7F5B] focus-visible:ring-[#6B7F5B]/30 rounded-xl bg-[#F8F6EE]/50 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="event-title" className="text-xs font-semibold text-[#2E3A2F]">
                Event Title <span className="text-[#C96F4F]">*</span>
              </Label>
              <Input
                id="event-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AC Deep Cleaning & Gas Refill"
                className="border-[#D9C9B2] focus-visible:border-[#6B7F5B] focus-visible:ring-[#6B7F5B]/30 rounded-xl bg-[#F8F6EE]/50 text-sm font-medium"
                required
              />
            </div>
          </div>

          {/* Slot Time & Vendor Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="slot-time" className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5">
                <Clock className="size-3.5 text-[#6B7F5B]" />
                Slot Time <span className="text-[#C96F4F]">*</span>
              </Label>
              <Input
                id="slot-time"
                value={slotTime}
                onChange={(e) => setSlotTime(e.target.value)}
                placeholder="e.g. Saturday, Oct 11 • 10:00 AM - 2:00 PM"
                className="border-[#D9C9B2] focus-visible:border-[#6B7F5B] focus-visible:ring-[#6B7F5B]/30 rounded-xl bg-[#F8F6EE]/50 text-sm"
                required
              />
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setSlotTime("This Saturday • 10:00 AM - 2:00 PM")}
                  className="text-[11px] text-[#6B7F5B] hover:text-[#2E3A2F] underline underline-offset-2"
                >
                  This Saturday
                </button>
                <span className="text-[11px] text-[#2E3A2F]/40">•</span>
                <button
                  type="button"
                  onClick={() => setSlotTime("This Sunday • 11:00 AM - 3:00 PM")}
                  className="text-[11px] text-[#6B7F5B] hover:text-[#2E3A2F] underline underline-offset-2"
                >
                  This Sunday
                </button>
                <span className="text-[11px] text-[#2E3A2F]/40">•</span>
                <button
                  type="button"
                  onClick={() => setSlotTime("Next Weekend • Slots all day")}
                  className="text-[11px] text-[#6B7F5B] hover:text-[#2E3A2F] underline underline-offset-2"
                >
                  Next Weekend
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vendor-name" className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5">
                <Building2 className="size-3.5 text-[#6B7F5B]" />
                Vendor Name <span className="text-[#C96F4F]">*</span>
              </Label>
              <Input
                id="vendor-name"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. CoolCare Services Pvt Ltd"
                className="border-[#D9C9B2] focus-visible:border-[#6B7F5B] focus-visible:ring-[#6B7F5B]/30 rounded-xl bg-[#F8F6EE]/50 text-sm"
                required
              />
            </div>
          </div>

          {/* Min Participants */}
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="min-participants" className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5">
              <Users className="size-3.5 text-[#6B7F5B]" />
              Min Participants to Activate Pool <span className="text-[#C96F4F]">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="min-participants"
                type="number"
                min={1}
                max={500}
                value={minParticipants}
                onChange={(e) => setMinParticipants(Math.max(1, parseInt(e.target.value) || 1))}
                className="border-[#D9C9B2] focus-visible:border-[#6B7F5B] focus-visible:ring-[#6B7F5B]/30 rounded-xl bg-[#F8F6EE]/50 text-sm w-32"
                required
              />
              <span className="text-xs text-[#2E3A2F]/70">flats required</span>
            </div>
          </div>

          {/* Dynamic Price Tiers */}
          <div className="space-y-3 pt-2 border-t border-[#E8E3D6]">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold text-[#2E3A2F] uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="size-3.5 text-[#C96F4F]" />
                  Dynamic Price Tiers (Volume Discount)
                </Label>
                <p className="text-[11px] text-[#2E3A2F]/70 mt-0.5">
                  Price automatically drops for all joined neighbors as more flats join.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTier}
                className="border-[#D9C9B2] hover:bg-[#E8E3D6] text-[#2E3A2F] rounded-xl text-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="size-3.5 text-[#C96F4F]" />
                <span>+ Add Tier</span>
              </Button>
            </div>

            <div className="space-y-2.5">
              {priceTiers.map((tier, index) => (
                <div
                  key={index}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 p-3 rounded-xl bg-[#F8F6EE]/80 border border-[#D9C9B2]"
                >
                  <div className="flex items-center gap-1 min-w-[70px]">
                    <span className="size-5 rounded-full bg-[#E8E3D6] text-[#2E3A2F] text-[11px] font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-xs font-semibold text-[#2E3A2F]">Tier</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-1 min-w-[170px]">
                    <div className="space-y-0.5 flex-1">
                      <span className="text-[10px] text-[#2E3A2F]/60 block font-medium">Min Flats</span>
                      <Input
                        type="number"
                        min={1}
                        value={tier.minFlats}
                        onChange={(e) =>
                          handleTierChange(index, "minFlats", Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="h-8 border-[#D9C9B2] bg-white rounded-lg text-xs"
                      />
                    </div>
                    <span className="text-xs text-[#2E3A2F]/50 mt-3">-</span>
                    <div className="space-y-0.5 flex-1">
                      <span className="text-[10px] text-[#2E3A2F]/60 block font-medium">Max Flats</span>
                      <Input
                        type="number"
                        min={tier.minFlats}
                        value={tier.maxFlats ?? 999}
                        onChange={(e) =>
                          handleTierChange(index, "maxFlats", parseInt(e.target.value) || 999)
                        }
                        className="h-8 border-[#D9C9B2] bg-white rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-0.5 min-w-[120px]">
                    <span className="text-[10px] text-[#2E3A2F]/60 block font-medium">Price (₹/flat)</span>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-xs text-[#2E3A2F]/60">₹</span>
                      <Input
                        type="number"
                        min={1}
                        value={tier.price}
                        onChange={(e) =>
                          handleTierChange(index, "price", Math.max(1, parseInt(e.target.value) || 0))
                        }
                        className="h-8 pl-6 border-[#D9C9B2] bg-white rounded-lg text-xs font-semibold text-[#2E3A2F]"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemoveTier(index)}
                      disabled={priceTiers.length <= 1}
                      className="size-8 text-[#2E3A2F]/50 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      title="Remove Tier"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Live Tier Preview */}
            <div className="p-3 rounded-xl bg-[#E8E3D6]/50 border border-[#D9C9B2]/60 text-xs text-[#2E3A2F] flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-[#6B7F5B] flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5" />
                Configured {priceTiers.length} dynamic pricing steps
              </span>
              <div className="flex gap-2">
                {priceTiers.map((t, i) => (
                  <Badge key={i} variant="outline" className="border-[#D9C9B2] bg-white text-[10px] font-semibold">
                    {t.minFlats}{t.maxFlats && t.maxFlats < 999 ? `-${t.maxFlats}` : "+"} flats: ₹{t.price}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 pt-3 border-t border-[#E8E3D6] flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-[#D9C9B2] text-[#2E3A2F] hover:bg-[#E8E3D6]/50 rounded-xl cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold rounded-xl flex-1 cursor-pointer shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  Creating Group Booking...
                </>
              ) : (
                <>
                  <Plus className="size-4 mr-1.5" />
                  Launch Group Booking Pool
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
