"use client";

import * as React from "react";
import {
  Calendar,
  Clock,
  Building2,
  Tag,
  Users,
  CheckCircle2,
  Loader2,
  AlertCircle,
  HelpCircle,
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
import type { AdminEventItem } from "./admin-dashboard";

interface EditEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: AdminEventItem | null;
  onEventUpdated?: (updatedEvent: AdminEventItem) => void;
}

const SERVICE_TYPE_PRESETS = [
  "AC Servicing",
  "Deep Cleaning",
  "Car Wash",
  "Pest Control",
  "Sofa Cleaning",
  "RO Service",
  "Painting",
  "Plumbing",
  "Electrical",
  "Other",
];

function parseSlotDateTime(slotTime?: string | null): { dateStr: string; timeStr: string } {
  if (!slotTime) {
    const today = new Date().toISOString().split("T")[0];
    return { dateStr: today, timeStr: "11:00 AM" };
  }

  const d = new Date(slotTime);
  if (!isNaN(d.getTime())) {
    const dateStr = d.toISOString().split("T")[0];
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return {
      dateStr,
      timeStr: `${formattedHours}:${formattedMinutes} ${ampm}`,
    };
  }

  return { dateStr: new Date().toISOString().split("T")[0], timeStr: slotTime };
}

function combineToIso(dateStr: string, timeStr: string): string {
  // If dateStr is YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const timeMatch = (timeStr || "").match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    let hours = 11;
    let mins = 0;
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const isPm = timeMatch[3]?.toLowerCase() === "pm";
      const isAm = timeMatch[3]?.toLowerCase() === "am";
      if (isPm && hours < 12) hours += 12;
      if (isAm && hours === 12) hours = 0;
    }
    const d = new Date(dateStr);
    d.setHours(hours, mins, 0, 0);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  const parsed = new Date(`${dateStr} ${timeStr}`);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

export function EditEventDialog({
  open,
  onOpenChange,
  event,
  onEventUpdated,
}: EditEventDialogProps) {
  const [serviceType, setServiceType] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [vendorName, setVendorName] = React.useState("");
  const [slotDate, setSlotDate] = React.useState("");
  const [slotTime, setSlotTime] = React.useState("");
  const [minParticipants, setMinParticipants] = React.useState<number>(5);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // 3 Distinct Pricing Tiers
  const [tier1, setTier1] = React.useState<{ minFlats: number; maxFlats: number; price: number }>({
    minFlats: 1,
    maxFlats: 5,
    price: 499,
  });
  const [tier2, setTier2] = React.useState<{ minFlats: number; maxFlats: number; price: number }>({
    minFlats: 6,
    maxFlats: 15,
    price: 399,
  });
  const [tier3, setTier3] = React.useState<{ minFlats: number; maxFlats: number | null; price: number }>({
    minFlats: 16,
    maxFlats: 999,
    price: 299,
  });

  // Populate form whenever `event` or `open` changes
  React.useEffect(() => {
    if (!event || !open) return;

    setServiceType(event.service_type || "Home Service");
    setTitle(event.title || "");
    setVendorName(event.vendor_name || "");
    setMinParticipants(Number(event.min_participants) || 5);

    const { dateStr, timeStr } = parseSlotDateTime(event.slot_time);
    setSlotDate(dateStr);
    setSlotTime(timeStr);

    const eventTiers = event.price_tiers || [];
    if (eventTiers.length >= 3) {
      setTier1({
        minFlats: Number(eventTiers[0].minFlats) || 1,
        maxFlats: Number(eventTiers[0].maxFlats) || 5,
        price: Number(eventTiers[0].price) || 499,
      });
      setTier2({
        minFlats: Number(eventTiers[1].minFlats) || 6,
        maxFlats: Number(eventTiers[1].maxFlats) || 15,
        price: Number(eventTiers[1].price) || 399,
      });
      setTier3({
        minFlats: Number(eventTiers[2].minFlats) || 16,
        maxFlats: eventTiers[2].maxFlats ? Number(eventTiers[2].maxFlats) : 999,
        price: Number(eventTiers[2].price) || 299,
      });
    } else if (eventTiers.length === 2) {
      setTier1({
        minFlats: Number(eventTiers[0].minFlats) || 1,
        maxFlats: Number(eventTiers[0].maxFlats) || 5,
        price: Number(eventTiers[0].price) || 499,
      });
      setTier2({
        minFlats: Number(eventTiers[1].minFlats) || 6,
        maxFlats: Number(eventTiers[1].maxFlats) || 15,
        price: Number(eventTiers[1].price) || 399,
      });
      setTier3({
        minFlats: (Number(eventTiers[1].maxFlats) || 15) + 1,
        maxFlats: 999,
        price: Math.max(99, Math.round((Number(eventTiers[1].price) || 399) * 0.8)),
      });
    } else if (eventTiers.length === 1) {
      const base = Number(eventTiers[0].price) || 499;
      setTier1({
        minFlats: 1,
        maxFlats: 5,
        price: base,
      });
      setTier2({
        minFlats: 6,
        maxFlats: 15,
        price: Math.round(base * 0.8),
      });
      setTier3({
        minFlats: 16,
        maxFlats: 999,
        price: Math.round(base * 0.6),
      });
    }
  }, [event, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    // PART 4 Validation
    if (!title.trim()) {
      toast.error("Event title cannot be empty");
      return;
    }
    if (!serviceType.trim()) {
      toast.error("Service type cannot be empty");
      return;
    }
    if (!vendorName.trim()) {
      toast.error("Vendor name cannot be empty");
      return;
    }
    if (!slotDate.trim() || !slotTime.trim()) {
      toast.error("Please specify both date and slot time");
      return;
    }

    if (minParticipants <= 0 || isNaN(minParticipants)) {
      toast.error("Target / minimum participant count must be greater than 0");
      return;
    }

    // Pricing tiers validation
    const tiersArray = [
      { minFlats: Number(tier1.minFlats), maxFlats: Number(tier1.maxFlats), price: Number(tier1.price) },
      { minFlats: Number(tier2.minFlats), maxFlats: Number(tier2.maxFlats), price: Number(tier2.price) },
      { minFlats: Number(tier3.minFlats), maxFlats: tier3.maxFlats != null ? Number(tier3.maxFlats) : 999, price: Number(tier3.price) },
    ];

    // 1. Negative or zero prices
    if (tiersArray.some((t) => t.price <= 0 || isNaN(t.price))) {
      toast.error("All pricing tiers must have a positive price greater than ₹0");
      return;
    }

    // 2. Negative or zero flat counts
    if (tiersArray.some((t) => t.minFlats <= 0 || isNaN(t.minFlats))) {
      toast.error("All tier flat minimums must be greater than 0");
      return;
    }

    // 3. Ascending order of participant count thresholds
    if (tiersArray[1].minFlats <= tiersArray[0].minFlats) {
      toast.error(`Tier 2 start (${tiersArray[1].minFlats}) must be greater than Tier 1 start (${tiersArray[0].minFlats})`);
      return;
    }
    if (tiersArray[2].minFlats <= tiersArray[1].minFlats) {
      toast.error(`Tier 3 start (${tiersArray[2].minFlats}) must be greater than Tier 2 start (${tiersArray[1].minFlats})`);
      return;
    }

    // 4. Max flats >= min flats
    if (tiersArray[0].maxFlats < tiersArray[0].minFlats) {
      toast.error("Tier 1 max flats cannot be less than its min flats");
      return;
    }
    if (tiersArray[1].maxFlats < tiersArray[1].minFlats) {
      toast.error("Tier 2 max flats cannot be less than its min flats");
      return;
    }

    // 5. Discount ladder order: higher volume tiers should be priced lower
    if (tiersArray[1].price >= tiersArray[0].price) {
      toast.error(`Tier 2 price (₹${tiersArray[1].price}) must be lower than Tier 1 price (₹${tiersArray[0].price}) to provide a volume discount`);
      return;
    }
    if (tiersArray[2].price >= tiersArray[1].price) {
      toast.error(`Tier 3 price (₹${tiersArray[2].price}) must be lower than Tier 2 price (₹${tiersArray[1].price}) to provide a volume discount`);
      return;
    }

    const isoSlotTime = combineToIso(slotDate, slotTime);

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const updatedPayload = {
        title: title.trim(),
        service_type: serviceType.trim(),
        vendor_name: vendorName.trim(),
        slot_time: isoSlotTime,
        min_participants: Number(minParticipants),
        price_tiers: tiersArray,
      };

      const { data, error } = await supabase
        .from("events")
        .update(updatedPayload)
        .eq("id", event.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating event in Supabase:", error);
        toast.error("Failed to update event: " + error.message);
        return;
      }

      toast.success(`Group booking "${title}" updated successfully!`, {
        description: "Changes are live for all society residents.",
      });

      onEventUpdated?.({
        ...event,
        ...data,
        price_tiers: tiersArray,
        slot_time: isoSlotTime,
      });

      onOpenChange(false);
    } catch (err: unknown) {
      console.error("Unexpected error in EditEventDialog:", err);
      const e = err as { message?: string };
      toast.error(e?.message || "Failed to save changes");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white border-[#D9C9B2] text-[#2E3A2F]">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <Badge
              variant="outline"
              className="border-[#D9C9B2] bg-[#F8F6EE] text-[#2E3A2F] text-[10px] font-semibold"
            >
              Event ID: {event.id.slice(0, 8)}...
            </Badge>
            <Badge
              className={`text-[10px] font-semibold ${
                event.status === "open"
                  ? "bg-[#6B7F5B] text-[#F8F6EE]"
                  : event.status === "cancelled"
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              {event.status === "open"
                ? "Active Pool"
                : event.status === "cancelled"
                ? "Cancelled"
                : "Completed"}
            </Badge>
          </div>
          <DialogTitle className="font-heading font-bold text-xl text-[#2E3A2F]">
            Edit Group Booking
          </DialogTitle>
          <DialogDescription className="text-xs text-[#2E3A2F]/70">
            Modify schedule, vendor, target participant threshold, and volume pricing tiers. Existing participants are preserved.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Service Type and Title */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="edit-service-type" className="text-xs font-semibold text-[#2E3A2F]">
                Service Type *
              </Label>
              <select
                id="edit-service-type"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                className="w-full text-xs h-9 rounded-xl border border-[#D9C9B2] bg-[#F8F6EE]/40 px-2.5 text-[#2E3A2F] focus:outline-none focus:ring-2 focus:ring-[#6B7F5B]/30"
              >
                {SERVICE_TYPE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-title" className="text-xs font-semibold text-[#2E3A2F]">
                Event Title *
              </Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AC Deep Cleaning & Gas Refill"
                className="text-xs h-9 rounded-xl border-[#D9C9B2] bg-[#F8F6EE]/40"
                required
              />
            </div>
          </div>

          {/* Vendor Name and Target Participants */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-vendor" className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5">
                <Building2 className="size-3.5 text-[#6B7F5B]" />
                Vendor Name *
              </Label>
              <Input
                id="edit-vendor"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. CoolCare Express"
                className="text-xs h-9 rounded-xl border-[#D9C9B2] bg-[#F8F6EE]/40"
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="edit-min-participants" className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5">
                <Users className="size-3.5 text-[#C96F4F]" />
                Target Flats *
              </Label>
              <Input
                id="edit-min-participants"
                type="number"
                min={1}
                value={minParticipants}
                onChange={(e) => setMinParticipants(Math.max(1, parseInt(e.target.value) || 1))}
                className="text-xs h-9 rounded-xl border-[#D9C9B2] bg-[#F8F6EE]/40"
                required
              />
            </div>
          </div>

          {/* Schedule: Date and Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-date" className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5">
                <Calendar className="size-3.5 text-[#6B7F5B]" />
                Execution Date *
              </Label>
              <Input
                id="edit-date"
                type="date"
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
                className="text-xs h-9 rounded-xl border-[#D9C9B2] bg-[#F8F6EE]/40"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-time" className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5">
                <Clock className="size-3.5 text-[#6B7F5B]" />
                Slot Time *
              </Label>
              <Input
                id="edit-time"
                value={slotTime}
                onChange={(e) => setSlotTime(e.target.value)}
                placeholder="e.g. 11:00 AM or 10:00 AM - 2:00 PM"
                className="text-xs h-9 rounded-xl border-[#D9C9B2] bg-[#F8F6EE]/40"
                required
              />
            </div>
          </div>

          {/* Pricing Tiers Section */}
          <div className="space-y-2 pt-2 border-t border-[#D9C9B2]/60">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-[#2E3A2F] flex items-center gap-1.5">
                <Tag className="size-3.5 text-[#C96F4F]" />
                Volume Discount Ladder (3 Tiers)
              </Label>
              <span className="text-[10px] text-[#2E3A2F]/60">
                Bulk rates unlock automatically
              </span>
            </div>

            {/* Tier 1 */}
            <div className="p-3 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#2E3A2F]">
                  Pricing Tier 1 (Base Tier)
                </span>
                <Badge className="bg-[#2E3A2F] text-[#F8F6EE] text-[9px] px-1.5 py-0.2 rounded">
                  {tier1.minFlats}–{tier1.maxFlats} flats
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-[#2E3A2F]/70 block">Min Flats</label>
                  <Input
                    type="number"
                    min={1}
                    value={tier1.minFlats}
                    onChange={(e) => setTier1({ ...tier1, minFlats: parseInt(e.target.value) || 1 })}
                    className="h-8 text-xs bg-white border-[#D9C9B2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#2E3A2F]/70 block">Max Flats</label>
                  <Input
                    type="number"
                    min={tier1.minFlats}
                    value={tier1.maxFlats}
                    onChange={(e) => setTier1({ ...tier1, maxFlats: parseInt(e.target.value) || 5 })}
                    className="h-8 text-xs bg-white border-[#D9C9B2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#2E3A2F]/70 block">Price / flat (₹)</label>
                  <Input
                    type="number"
                    min={1}
                    value={tier1.price}
                    onChange={(e) => setTier1({ ...tier1, price: parseInt(e.target.value) || 0 })}
                    className="h-8 text-xs bg-white border-[#D9C9B2] rounded-lg font-bold text-[#2E3A2F]"
                  />
                </div>
              </div>
            </div>

            {/* Tier 2 */}
            <div className="p-3 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#2E3A2F]">
                  Pricing Tier 2 (Volume Tier)
                </span>
                <Badge className="bg-[#C96F4F] text-[#F8F6EE] text-[9px] px-1.5 py-0.2 rounded">
                  {tier2.minFlats}–{tier2.maxFlats} flats
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-[#2E3A2F]/70 block">Min Flats</label>
                  <Input
                    type="number"
                    min={tier1.maxFlats + 1}
                    value={tier2.minFlats}
                    onChange={(e) => setTier2({ ...tier2, minFlats: parseInt(e.target.value) || 6 })}
                    className="h-8 text-xs bg-white border-[#D9C9B2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#2E3A2F]/70 block">Max Flats</label>
                  <Input
                    type="number"
                    min={tier2.minFlats}
                    value={tier2.maxFlats}
                    onChange={(e) => setTier2({ ...tier2, maxFlats: parseInt(e.target.value) || 15 })}
                    className="h-8 text-xs bg-white border-[#D9C9B2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#2E3A2F]/70 block">Price / flat (₹)</label>
                  <Input
                    type="number"
                    min={1}
                    value={tier2.price}
                    onChange={(e) => setTier2({ ...tier2, price: parseInt(e.target.value) || 0 })}
                    className="h-8 text-xs bg-white border-[#D9C9B2] rounded-lg font-bold text-[#C96F4F]"
                  />
                </div>
              </div>
            </div>

            {/* Tier 3 */}
            <div className="p-3 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#2E3A2F]">
                  Pricing Tier 3 (Wholesale Tier)
                </span>
                <Badge className="bg-[#6B7F5B] text-[#F8F6EE] text-[9px] px-1.5 py-0.2 rounded">
                  {tier3.minFlats}+ flats
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-[#2E3A2F]/70 block">Min Flats</label>
                  <Input
                    type="number"
                    min={tier2.maxFlats + 1}
                    value={tier3.minFlats}
                    onChange={(e) => setTier3({ ...tier3, minFlats: parseInt(e.target.value) || 16 })}
                    className="h-8 text-xs bg-white border-[#D9C9B2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#2E3A2F]/70 block">Max Flats</label>
                  <Input
                    type="number"
                    value={tier3.maxFlats ?? 999}
                    onChange={(e) => setTier3({ ...tier3, maxFlats: parseInt(e.target.value) || 999 })}
                    className="h-8 text-xs bg-white border-[#D9C9B2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#2E3A2F]/70 block">Price / flat (₹)</label>
                  <Input
                    type="number"
                    min={1}
                    value={tier3.price}
                    onChange={(e) => setTier3({ ...tier3, price: parseInt(e.target.value) || 0 })}
                    className="h-8 text-xs bg-white border-[#D9C9B2] rounded-lg font-bold text-[#6B7F5B]"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              className="border-[#D9C9B2] text-[#2E3A2F] text-xs h-9 rounded-xl cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] text-xs h-9 font-semibold rounded-xl px-4 cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
