"use client";

import * as React from "react";
import Link from "next/link";
import {
  TrendingUp,
  Plus,
  Users,
  Building,
  Calendar,
  Clock,
  ShieldCheck,
  Tag,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Trash2,
  Eye,
  RefreshCw,
  LogOut,
  Bell,
  Search,
  ExternalLink,
  XCircle,
  Loader2,
  Edit3,
  Ban,
  ChevronDown,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateEventDialog } from "@/components/admin/create-event-dialog";
import { EditEventDialog } from "@/components/admin/edit-event-dialog";
import { createClient } from "@/lib/supabase/client";
import {
  parsePriceTiers,
  calculateEventPricing,
} from "@/lib/pricing";
import { format } from "date-fns";
import { toast } from "sonner";
import type { DatabaseEventRow, PriceTier, ServiceRequest } from "@/types";

export interface EventParticipant {
  id: string;
  user_id?: string;
  flat_no: string;
  joined_at?: string;
}

export function formatSlotTime(slotTime?: string | null): string {
  if (!slotTime) return "Slots available this weekend";
  try {
    const date = new Date(slotTime);
    if (isNaN(date.getTime())) return slotTime;
    return format(date, "EEE, d MMM h:mm a");
  } catch {
    return slotTime;
  }
}

export interface AdminEventItem {
  id: string;
  title: string;
  service_type: string;
  slot_time?: string | null;
  vendor_name?: string | null;
  min_participants: number;
  max_participants?: number | null;
  price_tiers: PriceTier[];
  status: string;
  created_at: string;
  participants: EventParticipant[];
  currentPrice: number;
  basePrice: number;
  originalPrice?: number;
  nextTierPrice?: number;
  nextTierNeeded?: number;
  progressText: string;
  progressPercent: number;
  targetCount: number;
}

interface AdminDashboardProps {
  initialEvents: AdminEventItem[];
  initialRequests?: ServiceRequest[];
}

export function AdminDashboard({
  initialEvents,
  initialRequests = [],
}: AdminDashboardProps) {
  const [events, setEvents] = React.useState<AdminEventItem[]>(initialEvents);
  const [serviceRequests, setServiceRequests] =
    React.useState<ServiceRequest[]>(initialRequests);
  const [createPreset, setCreatePreset] = React.useState<{
    serviceType?: string;
    title?: string;
    requestId?: string | null;
  }>({});
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<"all" | "open" | "completed" | "cancelled">("all");

  // Selected event for editing, cancelling, and viewing participants
  const [selectedEventForEdit, setSelectedEventForEdit] =
    React.useState<AdminEventItem | null>(null);
  const [eventToCancel, setEventToCancel] =
    React.useState<AdminEventItem | null>(null);
  const [manageMenuOpenId, setManageMenuOpenId] =
    React.useState<string | null>(null);
  const [selectedEventForParticipants, setSelectedEventForParticipants] =
    React.useState<AdminEventItem | null>(null);

  // Close manage dropdown menu on outside click
  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-manage-menu]")) {
        setManageMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const fetchEvents = React.useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("events")
        .select("*, participants(id, user_id, flat_no, joined_at)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching admin events:", error);
        toast.error("Could not load events from Supabase");
        return;
      }

      const rawList = (data as unknown as (DatabaseEventRow & { participants?: EventParticipant[] })[]) ?? [];

      const parsedItems: AdminEventItem[] = rawList.map((row) => {
        const participants = row.participants && Array.isArray(row.participants) ? row.participants : [];
        const participantCount = participants.length;
        const tiers = parsePriceTiers(row.price_tiers);
        const pricing = calculateEventPricing(
          participantCount,
          tiers,
          row.min_participants,
          row.max_participants
        );

        const target = pricing.targetCount;
        const progressPercent = Math.min(
          100,
          target > 0 ? Math.max(0, Math.round((participantCount / target) * 100)) : 0
        );

        return {
          id: row.id,
          title: row.title,
          service_type: row.service_type || "Home Service",
          slot_time: row.slot_time,
          vendor_name: row.vendor_name || "Verified Partner",
          min_participants: row.min_participants || 5,
          max_participants: row.max_participants,
          price_tiers: tiers,
          status: row.status || "open",
          created_at: row.created_at,
          participants,
          currentPrice: pricing.currentPrice,
          basePrice: pricing.basePrice,
          originalPrice: pricing.originalPrice,
          nextTierPrice: pricing.nextTierPrice,
          nextTierNeeded: pricing.nextTierNeeded,
          progressText: pricing.progressText,
          progressPercent,
          targetCount: target,
        };
      });

      setEvents(parsedItems);
    } catch (err) {
      console.error("Error in fetchEvents:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const fetchServiceRequests = React.useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setServiceRequests(data as ServiceRequest[]);
      }
    } catch (err) {
      console.warn("fetchServiceRequests error:", err);
    }
  }, []);

  React.useEffect(() => {
    fetchServiceRequests();

    // Subscribe to realtime updates for participants, events, and service_requests
    const supabase = createClient();
    const channel = supabase
      .channel("admin-dashboard-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants" },
        () => {
          fetchEvents();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          fetchEvents();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_requests" },
        () => {
          fetchServiceRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEvents, fetchServiceRequests]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchEvents();
    fetchServiceRequests();
    toast.success("Dashboard refreshed");
  };

  const handleApproveAndCreate = async (req: ServiceRequest) => {
    setActionLoadingId(req.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("service_requests")
        .update({ status: "approved" })
        .eq("id", req.id);

      if (error) {
        console.error("Error updating service request status to approved:", error);
        toast.error("Failed to approve request: " + error.message);
        return;
      }

      setServiceRequests((prev) => prev.filter((r) => r.id !== req.id));
      toast.success(`Request approved for ${req.service_name}`);

      setCreatePreset({
        serviceType: req.service_name,
        title: `${req.service_name} Group Booking`,
        requestId: req.id,
      });
      setIsCreateOpen(true);
    } catch (err) {
      console.error("Approve error:", err);
      toast.error("Failed to approve request");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectRequest = async (req: ServiceRequest) => {
    setActionLoadingId(req.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("service_requests")
        .update({ status: "rejected" })
        .eq("id", req.id);

      if (error) {
        console.error("Error updating service request status to rejected:", error);
        toast.error("Failed to reject request: " + error.message);
        return;
      }

      setServiceRequests((prev) => prev.filter((r) => r.id !== req.id));
      toast.info(`Request for ${req.service_name} rejected`);
    } catch (err) {
      console.error("Reject error:", err);
      toast.error("Failed to reject request");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelBooking = async (eventItem: AdminEventItem) => {
    setActionLoadingId(eventItem.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("events")
        .update({ status: "cancelled" })
        .eq("id", eventItem.id);

      if (error) {
        toast.error("Failed to cancel booking: " + error.message);
        return;
      }

      toast.success(`Booking "${eventItem.title}" cancelled`, {
        description: "Event marked as cancelled and hidden from active resident bookings.",
      });

      // Safely notify all participants via trusted server function
      try {
        await supabase.rpc("notify_event_status_change", {
          p_event_id: eventItem.id,
          p_new_status: "cancelled",
        });
      } catch {
        // Silently continue if table/function is not yet migrated
      }

      setEvents((prev) =>
        prev.map((e) => (e.id === eventItem.id ? { ...e, status: "cancelled" } : e))
      );
      setEventToCancel(null);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      toast.error(errorObj?.message || "Error cancelling event");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEventUpdated = (updatedEvent: AdminEventItem) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id === updatedEvent.id) {
          const participantCount = e.participants.length;
          const tiers = parsePriceTiers(updatedEvent.price_tiers);
          const pricing = calculateEventPricing(
            participantCount,
            tiers,
            updatedEvent.min_participants,
            updatedEvent.max_participants
          );
          const target = pricing.targetCount;
          const progressPercent = Math.min(
            100,
            target > 0 ? Math.max(0, Math.round((participantCount / target) * 100)) : 0
          );
          return {
            ...e,
            ...updatedEvent,
            price_tiers: tiers,
            currentPrice: pricing.currentPrice,
            basePrice: pricing.basePrice,
            originalPrice: pricing.originalPrice,
            nextTierPrice: pricing.nextTierPrice,
            nextTierNeeded: pricing.nextTierNeeded,
            progressText: pricing.progressText,
            progressPercent,
            targetCount: target,
          };
        }
        return e;
      })
    );
    setSelectedEventForEdit(null);
  };

  const handleToggleStatus = async (eventItem: AdminEventItem) => {
    const newStatus = eventItem.status === "open" ? "completed" : "open";
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("events")
        .update({ status: newStatus })
        .eq("id", eventItem.id);

      if (error) {
        toast.error("Failed to update event status: " + error.message);
        return;
      }

      toast.success(`Event marked as ${newStatus}`);

      // If marked as completed, notify participants safely via trusted server function
      if (newStatus === "completed") {
        try {
          await supabase.rpc("notify_event_status_change", {
            p_event_id: eventItem.id,
            p_new_status: "completed",
          });
        } catch {
          // Silently continue if table/function is not yet migrated
        }
      }

      setEvents((prev) =>
        prev.map((e) => (e.id === eventItem.id ? { ...e, status: newStatus } : e))
      );
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      toast.error(errorObj?.message || "Error updating event");
    }
  };

  // Filtered events
  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.service_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ev.vendor_name && ev.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (activeTab === "open") return ev.status === "open";
    if (activeTab === "completed") return ev.status === "completed";
    if (activeTab === "cancelled") return ev.status === "cancelled";
    return true;
  });

  const activePoolsCount = events.filter((e) => e.status === "open").length;
  const completedPoolsCount = events.filter((e) => e.status === "completed").length;
  const cancelledPoolsCount = events.filter((e) => e.status === "cancelled").length;
  const totalFlatsJoined = events.reduce((sum, e) => sum + e.participants.length, 0);

  return (
    <div className="min-h-screen bg-[#F8F6EE] text-[#2E3A2F] flex flex-col selection:bg-[#C96F4F]/20 pb-24">
      {/* Top ambient earthy accent gradient bar */}
      <div className="h-1.5 w-full gradient-earthy sticky top-0 z-50" />

      {/* Main Header with Toggle Switch & Residential Atmosphere */}
      <header className="relative z-40 hero-residential-bg border-b border-[#D9C9B2]/70 px-4 sm:px-6 lg:px-8 py-5 transition-all shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#2E3A2F] text-[#F8F6EE] flex items-center justify-center font-heading font-bold shadow-xs">
              <Building className="size-5 text-[#C96F4F]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-heading font-bold text-[#2E3A2F] tracking-tight">
                  Greenwood Society Admin Panel
                </h1>
                <Badge className="bg-[#6B7F5B] text-[#F8F6EE] text-[10px] font-semibold px-2 py-0.5 rounded-full border-none">
                  Secretary
                </Badge>
              </div>
              <p className="text-xs text-[#2E3A2F]/75 font-medium">
                Tower A-D • 320 Registered Flats • Management Portal
              </p>
            </div>
          </div>

          {/* Toggle Switch (Admin | Resident) & Controls */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {/* Toggle switch (Admin | Resident) */}
            <div className="inline-flex items-center rounded-xl bg-[#E8E3D6]/90 backdrop-blur-xs p-1 border border-[#D9C9B2] shadow-xs">
              <Link
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-[#2E3A2F] text-[#F8F6EE] shadow-xs transition-all cursor-pointer"
                aria-current="page"
              >
                Admin
              </Link>
              <Link
                href="/dashboard"
                onClick={() => {
                  document.cookie = "demo_role=resident; path=/; max-age=86400";
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#2E3A2F]/80 hover:text-[#2E3A2F] hover:bg-white/60 transition-all cursor-pointer"
              >
                Resident
              </Link>
            </div>

            {/* Ask Copilot Header Action */}
            <Link
              href="/copilot"
              title="Ask AI Society Copilot"
              className="h-8 rounded-xl border border-[#C96F4F]/60 bg-white/80 hover:bg-[#C96F4F]/10 text-[#C96F4F] text-xs font-semibold px-2.5 sm:px-3 inline-flex items-center gap-1 cursor-pointer shadow-xs transition-all"
            >
              <span>✨ Ask Copilot</span>
            </Link>

            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-[#D9C9B2] bg-white text-[#2E3A2F] hover:bg-[#E8E3D6] rounded-xl cursor-pointer"
              title="Refresh Dashboard"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>

            <Link href="/dashboard" title="View Resident Dashboard">
              <Avatar className="size-8 border border-[#D9C9B2] bg-[#2E3A2F] text-[#F8F6EE] cursor-pointer hover:opacity-90 transition-opacity">
                <AvatarFallback className="bg-[#2E3A2F] text-[#F8F6EE] text-xs font-bold">
                  GW
                </AvatarFallback>
              </Avatar>
            </Link>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={async () => {
                document.cookie = "demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0";
                const supabase = createClient();
                await supabase.auth.signOut();
                toast.success("Signed out");
                window.location.href = "/login";
              }}
              className="size-8 text-[#2E3A2F]/70 hover:text-[#C96F4F] hover:bg-[#E8E3D6] rounded-xl cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Savings Banner: 'Total Society Savings: ₹12,400' */}
        <section aria-labelledby="savings-banner-title">
          <Card className="border-[#D9C9B2] bg-white overflow-hidden shadow-xs relative">
            {/* Top decorative accent */}
            <div className="h-1 w-full bg-gradient-to-r from-[#6B7F5B] via-[#C96F4F] to-[#2E3A2F]" />
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#6B7F5B]/15 text-[#6B7F5B] text-xs font-semibold">
                    <TrendingUp className="size-3.5" />
                    <span>Quarterly Bulk Pooling Impact</span>
                  </div>
                  <h2
                    id="savings-banner-title"
                    className="text-2xl sm:text-3xl font-heading font-extrabold text-[#2E3A2F] tracking-tight"
                  >
                    Total Society Savings: ₹12,400
                  </h2>
                  <p className="text-sm text-[#2E3A2F]/80 leading-relaxed">
                    By aggregating individual service requirements into group bookings, Greenwood Society
                    residents saved an average of <strong>34%</strong> on vendor home services this month.
                  </p>
                </div>

                {/* KPI Highlights for Secretary */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto">
                  <div className="p-3.5 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/70 flex flex-col justify-center">
                    <span className="text-[11px] font-medium text-[#2E3A2F]/70 uppercase tracking-wider">
                      Active Pools
                    </span>
                    <span className="text-2xl font-heading font-bold text-[#2E3A2F]">
                      {activePoolsCount}
                    </span>
                    <span className="text-[10px] text-[#6B7F5B] font-medium mt-0.5">
                      Open for bookings
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/70 flex flex-col justify-center">
                    <span className="text-[11px] font-medium text-[#2E3A2F]/70 uppercase tracking-wider">
                      Flats Joined
                    </span>
                    <span className="text-2xl font-heading font-bold text-[#C96F4F]">
                      {totalFlatsJoined}
                    </span>
                    <span className="text-[10px] text-[#2E3A2F]/60 font-medium mt-0.5">
                      Across all bookings
                    </span>
                  </div>

                  <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/70 flex flex-col justify-center">
                    <span className="text-[11px] font-medium text-[#2E3A2F]/70 uppercase tracking-wider">
                      Avg Discount
                    </span>
                    <span className="text-2xl font-heading font-bold text-[#6B7F5B]">
                      35%
                    </span>
                    <span className="text-[10px] text-[#6B7F5B] font-medium mt-0.5">
                      Volume unlocked
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Resident Requests Section */}
        <section aria-labelledby="resident-requests-title" className="space-y-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h2
                  id="resident-requests-title"
                  className="text-xl font-heading font-bold text-[#2E3A2F]"
                >
                  Resident Requests
                </h2>
                <Badge
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-none ${
                    serviceRequests.length > 0
                      ? "bg-[#C96F4F] text-[#F8F6EE]"
                      : "bg-[#6B7F5B] text-[#F8F6EE]"
                  }`}
                >
                  {serviceRequests.length} Pending
                </Badge>
              </div>
              <p className="text-xs text-[#2E3A2F]/70">
                Service requests submitted by society flats awaiting group booking approval.
              </p>
            </div>
          </div>

          {serviceRequests.length === 0 ? (
            <Card className="border-[#D9C9B2] bg-white p-6 text-center shadow-xs">
              <CardContent className="space-y-2 p-0">
                <div className="size-10 rounded-xl bg-[#E8E3D6] text-[#6B7F5B] flex items-center justify-center mx-auto">
                  <CheckCircle2 className="size-5" />
                </div>
                <p className="text-sm font-semibold text-[#2E3A2F]">
                  No pending resident requests
                </p>
                <p className="text-xs text-[#2E3A2F]/60">
                  All requested services have been reviewed or converted into group pools.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {serviceRequests.map((req) => (
                <Card
                  key={req.id}
                  className="border-[#D9C9B2] bg-white flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  <CardContent className="p-4 sm:p-5 space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <Badge
                          variant="outline"
                          className="border-[#D9C9B2] bg-[#F8F6EE] text-[#2E3A2F] text-xs font-semibold px-2.5 py-0.5"
                        >
                          {req.service_name}
                        </Badge>
                        <Badge className="bg-[#E8E3D6] text-[#2E3A2F] text-[10px] font-semibold border border-[#D9C9B2]">
                          Pending
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-[#2E3A2F] flex items-center gap-1.5">
                          <span>{req.resident_name}</span>
                          <span className="text-[#2E3A2F]/40">•</span>
                          <span className="text-[#C96F4F]">Flat {req.flat_no}</span>
                        </div>
                        <p className="text-xs text-[#2E3A2F]/80 leading-relaxed bg-[#F8F6EE]/60 p-2.5 rounded-xl border border-[#D9C9B2]/50 italic">
                          &quot;{req.description || "No specific details provided."}&quot;
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#D9C9B2]/50 space-y-2.5">
                      <div className="flex items-center justify-between text-[11px] text-[#2E3A2F]/60">
                        <span>Submitted</span>
                        <span className="font-medium text-[#2E3A2F]/80">
                          {format(new Date(req.created_at), "d MMM, h:mm a")}
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-0.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionLoadingId === req.id}
                          onClick={() => handleRejectRequest(req)}
                          className="border-[#D9C9B2] text-[#2E3A2F] hover:bg-[#E8E3D6]/50 hover:text-red-700 rounded-xl text-xs px-3 h-8 cursor-pointer transition-colors"
                        >
                          {actionLoadingId === req.id ? (
                            <Loader2 className="size-3.5 animate-spin mr-1" />
                          ) : (
                            <XCircle className="size-3.5 mr-1" />
                          )}
                          <span>Reject</span>
                        </Button>

                        <Button
                          size="sm"
                          disabled={actionLoadingId === req.id}
                          onClick={() => handleApproveAndCreate(req)}
                          className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold rounded-xl text-xs px-3.5 h-8 cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors"
                        >
                          {actionLoadingId === req.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="size-3.5" />
                          )}
                          <span>Approve & Create Event</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Section Header with Actions & Filters */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div>
              <h2 className="text-xl font-heading font-bold text-[#2E3A2F]">
                Society Group Bookings
              </h2>
              <p className="text-xs text-[#2E3A2F]/70">
                Manage vendor schedules, monitor participant counts, and configure volume tiers.
              </p>
            </div>

            {/* Quick Desktop Create Event Action */}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setIsCreateOpen(true)}
                className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold rounded-xl text-xs sm:text-sm px-4 py-2 cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Plus className="size-4" />
                <span>+ Create Group Booking</span>
              </Button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#D9C9B2]/80 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="size-4 absolute left-3 top-2.5 text-[#2E3A2F]/50" />
              <input
                type="text"
                placeholder="Search by title, service, or vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs sm:text-sm pl-9 pr-3 py-1.5 rounded-xl border border-[#D9C9B2] bg-[#F8F6EE]/40 focus:outline-none focus:ring-2 focus:ring-[#6B7F5B]/30 focus:border-[#6B7F5B] text-[#2E3A2F]"
              />
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                  activeTab === "all"
                    ? "bg-[#2E3A2F] text-[#F8F6EE]"
                    : "text-[#2E3A2F]/70 hover:bg-[#E8E3D6]"
                }`}
              >
                All ({events.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("open")}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                  activeTab === "open"
                    ? "bg-[#6B7F5B] text-[#F8F6EE]"
                    : "text-[#2E3A2F]/70 hover:bg-[#E8E3D6]"
                }`}
              >
                Active ({activePoolsCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("completed")}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                  activeTab === "completed"
                    ? "bg-[#2E3A2F] text-[#F8F6EE]"
                    : "text-[#2E3A2F]/70 hover:bg-[#E8E3D6]"
                }`}
              >
                Completed ({completedPoolsCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("cancelled")}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                  activeTab === "cancelled"
                    ? "bg-red-700 text-white"
                    : "text-[#2E3A2F]/70 hover:bg-[#E8E3D6]"
                }`}
              >
                Cancelled ({cancelledPoolsCount})
              </button>
            </div>
          </div>
        </section>

        {/* Events Grid / List */}
        <section>
          {filteredEvents.length === 0 ? (
            <Card className="border-[#D9C9B2] bg-white text-center p-8 sm:p-12 shadow-xs">
              <CardContent className="flex flex-col items-center justify-center space-y-4">
                <div className="size-16 rounded-2xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#C96F4F]">
                  <Calendar className="size-8 text-[#C96F4F]" />
                </div>
                <div className="space-y-1 max-w-md">
                  <h3 className="text-lg font-heading font-semibold text-[#2E3A2F]">
                    No Group Bookings Found
                  </h3>
                  <p className="text-sm text-[#2E3A2F]/70">
                    {searchQuery
                      ? "No events match your search query. Try clearing the filter."
                      : "Start the first bulk service event for Greenwood Society residents to unlock wholesale rates."}
                  </p>
                </div>
                <Button
                  onClick={() => setIsCreateOpen(true)}
                  className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold rounded-xl text-sm px-5 py-2.5 cursor-pointer shadow-xs"
                >
                  <Plus className="size-4 mr-1.5" />
                  + Create Group Booking
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {filteredEvents.map((item) => (
                <Card
                  key={item.id}
                  className="card-earthy border-[#D9C9B2] bg-white flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  <div className="p-5 sm:p-6 space-y-4 flex-1">
                    {/* Header line: Category, Status, & Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-[#D9C9B2] bg-[#F8F6EE] text-[#2E3A2F] text-[11px] font-semibold"
                          >
                            {item.service_type}
                          </Badge>
                          <Badge
                            className={`text-[10px] font-semibold ${
                              item.status === "cancelled"
                                ? "bg-red-100 text-red-700 border border-red-200"
                                : item.status === "open"
                                ? "bg-[#6B7F5B] text-[#F8F6EE]"
                                : "bg-gray-200 text-gray-700"
                            }`}
                          >
                            {item.status === "cancelled"
                              ? "Cancelled"
                              : item.status === "open"
                              ? "Active Pool"
                              : "Completed"}
                          </Badge>
                        </div>
                        <Link href={`/event/${item.id}`} className="hover:underline">
                          <h3 className="text-lg sm:text-xl font-heading font-bold text-[#2E3A2F] hover:text-[#C96F4F] transition-colors leading-snug">
                            {item.title}
                          </h3>
                        </Link>
                      </div>

                      <div className="relative shrink-0" data-manage-menu>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setManageMenuOpenId(
                              manageMenuOpenId === item.id ? null : item.id
                            )
                          }
                          className="h-8 border-[#D9C9B2] bg-white hover:bg-[#E8E3D6] text-[#2E3A2F] text-xs font-semibold px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Settings className="size-3 text-[#6B7F5B]" />
                          <span>Manage</span>
                          <ChevronDown className="size-3 text-[#2E3A2F]/50" />
                        </Button>

                        {manageMenuOpenId === item.id && (
                          <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl bg-white border border-[#D9C9B2] shadow-xl py-1.5 z-40 animate-in fade-in-0 zoom-in-95 text-xs text-[#2E3A2F]">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedEventForEdit(item);
                                setManageMenuOpenId(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-[#F8F6EE] flex items-center gap-2 font-medium cursor-pointer transition-colors"
                            >
                              <Edit3 className="size-3.5 text-[#6B7F5B]" />
                              <span>Edit Event</span>
                            </button>

                            {item.status !== "cancelled" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEventToCancel(item);
                                  setManageMenuOpenId(null);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-700 flex items-center gap-2 font-medium cursor-pointer transition-colors"
                              >
                                <Ban className="size-3.5 text-red-600" />
                                <span>Cancel Booking</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  handleToggleStatus(item);
                                  setManageMenuOpenId(null);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-[#F8F6EE] text-[#6B7F5B] flex items-center gap-2 font-medium cursor-pointer transition-colors"
                              >
                                <CheckCircle2 className="size-3.5 text-[#6B7F5B]" />
                                <span>Re-open Pool</span>
                              </button>
                            )}

                            <div className="my-1 border-t border-[#D9C9B2]/50" />

                            <button
                              type="button"
                              onClick={() => {
                                handleToggleStatus(item);
                                setManageMenuOpenId(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-[#F8F6EE] flex items-center gap-2 font-medium cursor-pointer transition-colors"
                            >
                              <RefreshCw className="size-3.5 text-[#2E3A2F]/60" />
                              <span>{item.status === "open" ? "Mark Completed" : "Mark Active"}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedEventForParticipants(item);
                                setManageMenuOpenId(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-[#F8F6EE] flex items-center gap-2 font-medium cursor-pointer transition-colors"
                            >
                              <Eye className="size-3.5 text-[#2E3A2F]/60" />
                              <span>View Flats ({item.participants.length})</span>
                            </button>

                            <Link
                              href={`/event/${item.id}`}
                              onClick={() => setManageMenuOpenId(null)}
                              className="w-full text-left px-3 py-2 hover:bg-[#F8F6EE] flex items-center gap-2 font-medium cursor-pointer transition-colors block"
                            >
                              <ExternalLink className="size-3.5 text-[#C96F4F]" />
                              <span>Resident Event Page</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>

                    {item.status === "cancelled" && (
                      <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                        <AlertCircle className="size-3.5 text-red-600 shrink-0" />
                        <span>Booking Cancelled • Preserved in history • No new joins</span>
                      </div>
                    )}

                    {/* Vendor and Slot info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#2E3A2F]/80 p-2.5 rounded-xl bg-[#F8F6EE]/60 border border-[#D9C9B2]/50">
                      <div className="flex items-center gap-1.5">
                        <Building className="size-3.5 text-[#6B7F5B] shrink-0" />
                        <span className="truncate">
                          <strong>Vendor:</strong> {item.vendor_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-3.5 text-[#6B7F5B] shrink-0" />
                        <span className="truncate">
                          <strong>Slot:</strong> {formatSlotTime(item.slot_time)}
                        </span>
                      </div>
                    </div>

                    {/* Participation & Pricing Progress */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-[#2E3A2F] flex items-center gap-1.5">
                          <Users className="size-3.5 text-[#C96F4F]" />
                          <strong>{item.participants.length}</strong> flats joined
                        </span>
                        <span className="text-[#6B7F5B] font-semibold">
                          Current Price: ₹{item.currentPrice}/flat
                        </span>
                      </div>

                      {/* Progress bar */}
                      <Progress
                        value={item.progressPercent}
                        className="h-2 bg-[#E8E3D6] [&>div]:bg-[#6B7F5B]"
                      />

                      <div className="flex items-center justify-between text-[11px] text-[#2E3A2F]/70">
                        <span>{item.progressText}</span>
                        {item.originalPrice && item.originalPrice > item.currentPrice && (
                          <span className="text-[#C96F4F] font-semibold">
                            Saving ₹{item.originalPrice - item.currentPrice}/flat!
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Price Tiers display */}
                    <div className="pt-2 border-t border-[#E8E3D6]/70">
                      <span className="text-[10px] uppercase font-semibold text-[#2E3A2F]/60 block mb-1.5">
                        Configured Discount Tiers
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {item.price_tiers.map((tier, idx) => {
                          const isLastTier = idx === item.price_tiers.length - 1;
                          const isCurrentTier =
                            item.participants.length >= tier.minFlats &&
                            (tier.maxFlats == null ||
                              item.participants.length <= tier.maxFlats ||
                              (isLastTier && item.participants.length >= tier.minFlats));
                          return (
                            <div
                              key={idx}
                              className={`text-[11px] px-2 py-0.5 rounded-md border transition-all ${
                                isCurrentTier
                                  ? "bg-[#6B7F5B] text-[#F8F6EE] border-[#6B7F5B] font-semibold shadow-2xs"
                                  : "bg-[#F8F6EE] text-[#2E3A2F]/80 border-[#D9C9B2]"
                              }`}
                            >
                              {tier.minFlats}
                              {tier.maxFlats && tier.maxFlats < 999 ? `-${tier.maxFlats}` : "+"} flats:{" "}
                              <strong>₹{tier.price}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="p-3.5 sm:px-6 bg-[#F8F6EE]/40 border-t border-[#D9C9B2]/60 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedEventForEdit(item)}
                        className="border-[#D9C9B2] bg-white hover:bg-[#E8E3D6] text-[#2E3A2F] rounded-xl text-xs flex items-center gap-1.5 cursor-pointer font-semibold shadow-2xs"
                      >
                        <Edit3 className="size-3.5 text-[#6B7F5B]" />
                        <span>Edit Event</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedEventForParticipants(item)}
                        className="border-[#D9C9B2] bg-white hover:bg-[#E8E3D6] text-[#2E3A2F] rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="size-3.5 text-[#6B7F5B]" />
                        <span>View Flats ({item.participants.length})</span>
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.status !== "cancelled" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEventToCancel(item)}
                          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl cursor-pointer"
                        >
                          <Ban className="size-3.5 mr-1 text-red-600" />
                          <span>Cancel Booking</span>
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(item)}
                          className="text-xs text-[#6B7F5B] hover:text-[#5b6d4d] hover:bg-[#E8E3D6]/60 rounded-xl cursor-pointer"
                        >
                          <CheckCircle2 className="size-3.5 mr-1" />
                          <span>Re-open Pool</span>
                        </Button>
                      )}

                      <Link href={`/event/${item.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="border border-[#D9C9B2]/60 bg-white hover:bg-[#E8E3D6] text-[#2E3A2F] rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="size-3.5 text-[#C96F4F]" />
                          <span>Event Page</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Secondary Copilot FAB (fixed right above Create Booking FAB) */}
      <div className="fixed bottom-36 right-4 sm:right-6 z-50">
        <Link href="/copilot">
          <Button
            size="icon"
            className="size-11 sm:size-12 rounded-full bg-[#2E3A2F] hover:bg-[#1f2820] text-[#F8F6EE] shadow-lg hover:shadow-xl transition-all active:scale-95 border border-[#D9C9B2]/60 cursor-pointer flex items-center justify-center group"
            title="Ask Society Copilot"
            aria-label="Open AI Society Copilot"
          >
            <Sparkles className="size-5 text-[#C96F4F] group-hover:rotate-12 transition-transform" />
          </Button>
        </Link>
      </div>

      {/* Floating Action Button (FAB): '+ Create Group Booking' (Terracotta) */}
      <div className="fixed bottom-20 right-4 sm:right-6 z-50">
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold px-4 sm:px-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center gap-2 cursor-pointer border border-[#B85A3A]/40"
          aria-label="Create new group booking"
        >
          <Plus className="size-5" />
          <span className="font-heading font-medium tracking-wide text-xs sm:text-sm">
            + Create Group Booking
          </span>
        </Button>
      </div>

      {/* Create Event Dialog with all required fields & dynamic price tiers */}
      <CreateEventDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setCreatePreset({});
          }
        }}
        initialServiceType={createPreset.serviceType}
        initialTitle={createPreset.title}
        requestIdToApprove={createPreset.requestId}
        onEventCreated={() => {
          fetchEvents();
          fetchServiceRequests();
          setCreatePreset({});
        }}
      />

      {/* Edit Event Dialog (Part 2 & Part 4) */}
      <EditEventDialog
        open={!!selectedEventForEdit}
        onOpenChange={(open) => {
          if (!open) setSelectedEventForEdit(null);
        }}
        event={selectedEventForEdit}
        onEventUpdated={(updated) => {
          handleEventUpdated(updated);
          fetchEvents();
        }}
      />

      {/* Cancel Booking Confirmation Dialog (Part 3) */}
      <Dialog
        open={!!eventToCancel}
        onOpenChange={(open) => {
          if (!open) setEventToCancel(null);
        }}
      >
        <DialogContent className="max-w-md bg-white border border-[#D9C9B2] rounded-2xl p-6 text-[#2E3A2F]">
          <DialogHeader className="gap-2 text-center pb-2">
            <div className="size-12 rounded-xl bg-red-100 text-red-700 flex items-center justify-center mx-auto mb-1">
              <Ban className="size-6" />
            </div>
            <DialogTitle className="text-lg font-heading font-bold text-[#2E3A2F]">
              Cancel Group Booking?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#2E3A2F]/70 leading-relaxed">
              Are you sure you want to cancel &quot;{eventToCancel?.title}&quot;?
              The booking will be marked as <strong>cancelled</strong> in society history and will no longer accept new participants. Existing participant records will be safely preserved.
            </DialogDescription>
          </DialogHeader>

          {eventToCancel && (
            <div className="p-3 bg-[#F8F6EE] rounded-xl border border-[#D9C9B2]/60 text-xs text-[#2E3A2F] space-y-1.5 my-2">
              <div className="flex justify-between">
                <span className="text-[#2E3A2F]/60">Service:</span>
                <span className="font-semibold">{eventToCancel.service_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#2E3A2F]/60">Joined Flats:</span>
                <span className="font-semibold">{eventToCancel.participants.length} flats</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#2E3A2F]/60">Current Price:</span>
                <span className="font-semibold text-[#6B7F5B]">₹{eventToCancel.currentPrice}/flat</span>
              </div>
            </div>
          )}

          <div className="pt-2 flex flex-row items-center justify-end gap-2 border-t border-[#E8E3D6]">
            <Button
              variant="outline"
              onClick={() => setEventToCancel(null)}
              disabled={!!actionLoadingId}
              className="border-[#D9C9B2] text-[#2E3A2F] text-xs h-9 rounded-xl cursor-pointer"
            >
              Keep Event
            </Button>
            <Button
              onClick={() => eventToCancel && handleCancelBooking(eventToCancel)}
              disabled={!!actionLoadingId}
              className="bg-red-600 hover:bg-red-700 text-white text-xs h-9 font-semibold rounded-xl px-4 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              {actionLoadingId === eventToCancel?.id ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <Ban className="size-3.5" />
                  Confirm Cancellation
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Participants Detail Dialog */}
      <Dialog
        open={!!selectedEventForParticipants}
        onOpenChange={(open) => {
          if (!open) setSelectedEventForParticipants(null);
        }}
      >
        <DialogContent className="max-w-md bg-white border border-[#D9C9B2] rounded-2xl p-6 text-[#2E3A2F]">
          <DialogHeader className="gap-1.5 text-left pb-2 border-b border-[#E8E3D6]">
            <DialogTitle className="text-lg font-heading font-bold text-[#2E3A2F]">
              Joined Flats - {selectedEventForParticipants?.title}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#2E3A2F]/70">
              Total <strong>{selectedEventForParticipants?.participants.length}</strong> flats have opted in for this group booking. Current locked price: <strong>₹{selectedEventForParticipants?.currentPrice}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 overflow-y-auto space-y-2 py-3">
            {selectedEventForParticipants?.participants.length === 0 ? (
              <p className="text-xs text-[#2E3A2F]/60 text-center py-6">
                No flats have joined this pool yet.
              </p>
            ) : (
              selectedEventForParticipants?.participants.map((pt, index) => (
                <div
                  key={pt.id || index}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8F6EE] border border-[#D9C9B2]/60 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-6 rounded-full bg-[#2E3A2F] text-[#F8F6EE] text-[10px] font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="font-semibold text-[#2E3A2F]">{pt.flat_no}</span>
                  </div>
                  <Badge variant="outline" className="border-[#6B7F5B] text-[#6B7F5B] bg-white text-[10px]">
                    Confirmed
                  </Badge>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
