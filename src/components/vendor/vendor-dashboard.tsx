"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Building,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  Wrench,
  CheckCircle,
  ExternalLink,
  SlidersHorizontal,
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
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { formatSlotTime } from "@/lib/pricing";
import { toast } from "sonner";

export type FlatServiceStatus =
  | "remaining"
  | "awaiting_confirmation"
  | "verified"
  | "issue_reported";

export interface VendorFlatParticipant {
  id: string;
  user_id?: string;
  flat_no: string;
  joined_at?: string;
  service_status?: FlatServiceStatus;
}

export interface VendorBookingItem {
  id: string;
  title: string;
  service_type: string;
  slot_time?: string | null;
  vendor_name: string;
  status: string; // "open" | "completed" | "cancelled"
  society_id?: string | null;
  society_name?: string;
  created_at: string;
  participants: VendorFlatParticipant[];

  // Flat metrics (clearly separated)
  totalFlats: number;
  verifiedFlats: number;
  awaitingConfirmationFlats: number;
  issueReportedFlats: number;
  remainingFlats: number;
  vendorCompletedFlats: number;
  servicedFlats: number;

  // Progress
  progressPercent: number;
  progressText: string;
}

export interface VendorInfo {
  id: string;
  name: string;
  role: string;
  societyName?: string;
}

export interface SocietyItem {
  id: string;
  name: string;
}

export function recalculateBookingMetrics(
  booking: VendorBookingItem,
  participants: VendorFlatParticipant[]
): VendorBookingItem {
  const totalFlats = participants.length;
  const verifiedFlats = participants.filter((p) => p.service_status === "verified").length;
  const awaitingConfirmationFlats = participants.filter(
    (p) => p.service_status === "awaiting_confirmation"
  ).length;
  const issueReportedFlats = participants.filter((p) => p.service_status === "issue_reported").length;
  const remainingFlats = participants.filter(
    (p) => !p.service_status || p.service_status === "remaining"
  ).length;
  const vendorCompletedFlats = awaitingConfirmationFlats + verifiedFlats;

  const progressPercent =
    totalFlats > 0 ? Math.round((vendorCompletedFlats / totalFlats) * 100) : 0;
  const progressText =
    totalFlats > 0
      ? `${vendorCompletedFlats} of ${totalFlats} flats completed by vendor (${verifiedFlats} resident-verified)`
      : "No participating flats enrolled yet";

  return {
    ...booking,
    participants,
    totalFlats,
    verifiedFlats,
    awaitingConfirmationFlats,
    issueReportedFlats,
    remainingFlats,
    vendorCompletedFlats,
    servicedFlats: vendorCompletedFlats,
    progressPercent,
    progressText,
  };
}

interface VendorDashboardProps {
  initialBookings: VendorBookingItem[];
  vendorInfo: VendorInfo;
  societiesList: SocietyItem[];
}

export function VendorDashboard({
  initialBookings,
  vendorInfo,
  societiesList,
}: VendorDashboardProps) {
  const [bookings, setBookings] = React.useState<VendorBookingItem[]>(initialBookings);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "open" | "completed" | "cancelled">("all");
  const [expandedBookingId, setExpandedBookingId] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [selectedBookingForDetails, setSelectedBookingForDetails] = React.useState<VendorBookingItem | null>(null);

  // Service Completion Action state
  const [completionModalBooking, setCompletionModalBooking] = React.useState<VendorBookingItem | null>(null);
  const [isCheckingApi, setIsCheckingApi] = React.useState(false);
  const [apiVerificationResult, setApiVerificationResult] = React.useState<{
    checked: boolean;
    available: boolean;
    message: string;
  } | null>(null);

  const supabase = createClient();

  // Refresh bookings directly from Supabase
  const handleRefresh = async (silent = false) => {
    setIsRefreshing(true);
    try {
      const buildQuery = (fields: string) => {
        let q = supabase
          .from("events")
          .select(fields)
          .order("created_at", { ascending: false });

        if (vendorInfo.role === "vendor") {
          const trimmedVendorName = vendorInfo.name?.trim();
          if (trimmedVendorName) {
            // Exact case-insensitive match on assigned vendor
            q = q.ilike("vendor_name", trimmedVendorName);
          }
        }
        return q;
      };

      let rawEvents: any = null;
      const fullRes = await buildQuery(
        "*, participants(id, user_id, flat_no, joined_at, service_status, vendor_completed_at, resident_verified_at, issue_description)"
      );

      if (fullRes.error) {
        const fallbackRes = await buildQuery("*, participants(id, user_id, flat_no, joined_at)");
        if (fallbackRes.error) throw fallbackRes.error;
        rawEvents = fallbackRes.data || [];
      } else {
        rawEvents = fullRes.data || [];
      }

      const societyMap = new Map(societiesList.map((s) => [s.id, s.name]));

      const refreshedList: VendorBookingItem[] = (rawEvents || []).map((row: any) => {
        const rawParts = Array.isArray(row.participants) ? row.participants : [];
        const participants: VendorFlatParticipant[] = rawParts.map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          flat_no: p.flat_no || "Unknown Flat",
          joined_at: p.joined_at,
          service_status: p.service_status || "remaining",
        }));

        // Strict separation between vendor operational completion and resident verification
        const totalFlats = participants.length;
        const verifiedFlats = participants.filter((p) => p.service_status === "verified").length;
        const awaitingConfirmationFlats = participants.filter(
          (p) => p.service_status === "awaiting_confirmation"
        ).length;
        const issueReportedFlats = participants.filter((p) => p.service_status === "issue_reported").length;
        const remainingFlats = participants.filter(
          (p) => !p.service_status || p.service_status === "remaining"
        ).length;
        const vendorCompletedFlats = awaitingConfirmationFlats + verifiedFlats;

        const progressPercent = totalFlats > 0 ? Math.round((vendorCompletedFlats / totalFlats) * 100) : 0;
        const progressText =
          totalFlats > 0
            ? `${vendorCompletedFlats} of ${totalFlats} flats completed by vendor (${verifiedFlats} resident-verified)`
            : "No participating flats enrolled yet";

        const socName = row.society_id ? societyMap.get(row.society_id) || "Palm Meadows" : "All Societies";

        return {
          id: row.id,
          title: row.title,
          service_type: row.service_type || "Home Service",
          slot_time: row.slot_time,
          vendor_name: row.vendor_name || "Assigned Vendor",
          status: row.status || "open",
          society_id: row.society_id,
          society_name: socName,
          created_at: row.created_at,
          participants,
          totalFlats,
          verifiedFlats,
          awaitingConfirmationFlats,
          issueReportedFlats,
          remainingFlats,
          vendorCompletedFlats,
          servicedFlats: vendorCompletedFlats,
          progressPercent,
          progressText,
        };
      });

      setBookings(refreshedList);
      if (!silent) {
        toast.success("Vendor dashboard updated");
      }
    } catch (err: any) {
      console.error("Error refreshing vendor bookings:", err);
      if (!silent) {
        toast.error(err?.message || "Failed to refresh bookings");
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter bookings based on search query and status tab
  const filteredBookings = React.useMemo(() => {
    return bookings.filter((b) => {
      const matchesStatus =
        statusFilter === "all" ? true : b.status.toLowerCase() === statusFilter.toLowerCase();

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        b.title.toLowerCase().includes(q) ||
        b.service_type.toLowerCase().includes(q) ||
        (b.society_name && b.society_name.toLowerCase().includes(q)) ||
        b.participants.some((p) => p.flat_no.toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [bookings, searchQuery, statusFilter]);

  // Overall aggregate metrics across all vendor bookings (clearly separated)
  const aggregates = React.useMemo(() => {
    const totalBookings = bookings.length;
    const activeBookings = bookings.filter((b) => b.status === "open").length;
    const totalFlats = bookings.reduce((sum, b) => sum + b.totalFlats, 0);
    const totalVendorCompleted = bookings.reduce((sum, b) => sum + b.vendorCompletedFlats, 0);
    const totalVerifiedFlats = bookings.reduce((sum, b) => sum + b.verifiedFlats, 0);
    const totalAwaiting = bookings.reduce((sum, b) => sum + b.awaitingConfirmationFlats, 0);
    const totalIssueReported = bookings.reduce((sum, b) => sum + b.issueReportedFlats, 0);
    const totalRemaining = bookings.reduce((sum, b) => sum + b.remainingFlats, 0);

    return {
      totalBookings,
      activeBookings,
      totalFlats,
      totalVendorCompleted,
      totalVerifiedFlats,
      totalAwaiting,
      totalIssueReported,
      totalRemaining,
    };
  }, [bookings]);

  const [completingFlatId, setCompletingFlatId] = React.useState<string | null>(null);
  const [isSubmittingHandoff, setIsSubmittingHandoff] = React.useState(false);

  // Secure completion check: probe server route /api/vendor/completion
  const handleTestCompletionApi = async () => {
    if (!completionModalBooking) return;
    setIsCheckingApi(true);
    setApiVerificationResult(null);

    try {
      const firstParticipant = completionModalBooking.participants[0];
      const res = await fetch("/api/vendor/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          participant_id: firstParticipant?.id || "probe-id",
          event_id: completionModalBooking.id,
        }),
      });

      const data = await res.json();

      if (res.status === 501 && data.migration_required) {
        setApiVerificationResult({
          checked: true,
          available: false,
          message:
            "Secure API endpoint /api/vendor/completion is active. Database migration pending: column 'participants.service_status' must be created in Supabase.",
        });
      } else if (res.status === 403) {
        setApiVerificationResult({
          checked: true,
          available: false,
          message: `Authorization check: ${data.error}`,
        });
      } else if (res.ok) {
        setApiVerificationResult({
          checked: true,
          available: true,
          message: "Secure Completion API active and database columns verified.",
        });
      } else {
        setApiVerificationResult({
          checked: true,
          available: false,
          message: data.error || data.message || "Completion API responded with an error.",
        });
      }
    } catch (err: any) {
      setApiVerificationResult({
        checked: true,
        available: false,
        message: err?.message || "Failed to reach /api/vendor/completion endpoint.",
      });
    } finally {
      setIsCheckingApi(false);
    }
  };

  // Flat-level service completion action connected to secure API
  const handleCompleteFlat = async (participantId: string, eventId: string, flatNo: string) => {
    setCompletingFlatId(participantId);
    try {
      const res = await fetch("/api/vendor/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ participant_id: participantId, event_id: eventId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 501 && data.migration_required) {
          toast.error("Database Migration Pending", {
            description: "Column 'participants.service_status' is not yet present in Supabase.",
          });
        } else {
          toast.error(data.error || "Failed to record service completion.");
        }
        return;
      }

      // Optimistically update local booking state so flat transitions to 'awaiting_confirmation' immediately
      setBookings((prevBookings) =>
        prevBookings.map((b) => {
          if (b.id !== eventId) return b;
          const updatedParticipants = b.participants.map((p) =>
            p.id === participantId
              ? {
                  ...p,
                  service_status: "awaiting_confirmation" as FlatServiceStatus,
                }
              : p
          );
          return recalculateBookingMetrics(b, updatedParticipants);
        })
      );

      toast.success(`Flat ${flatNo} marked complete!`, {
        description: "Status transitioned to awaiting resident confirmation.",
      });

      // Synchronize with database from server without overwriting the success toast
      await handleRefresh(true);
    } catch (err: any) {
      toast.error(err?.message || "Network error submitting completion.");
    } finally {
      setCompletingFlatId(null);
    }
  };

  // Batch service completion handoff for all remaining flats in booking
  const handleBatchCompleteBooking = async () => {
    if (!completionModalBooking) return;
    setIsSubmittingHandoff(true);
    try {
      const pendingParticipants = completionModalBooking.participants.filter(
        (p) => !p.service_status || p.service_status === "remaining"
      );

      if (pendingParticipants.length === 0) {
        toast.info("All flats for this booking are already serviced or confirmed.");
        return;
      }

      let successCount = 0;
      let migrationRequired = false;
      let lastError = "";

      for (const p of pendingParticipants) {
        const res = await fetch("/api/vendor/completion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            participant_id: p.id,
            event_id: completionModalBooking.id,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          if (res.status === 501 && data.migration_required) {
            migrationRequired = true;
            break;
          }
          lastError = data.error || "Failed to complete flat.";
        } else {
          successCount++;
        }
      }

      if (migrationRequired) {
        toast.error("Database Migration Required", {
          description: "Cannot complete flats: 'participants.service_status' column must be added in Supabase.",
        });
      } else if (successCount > 0) {
        // Optimistically update batch in local state
        setBookings((prevBookings) =>
          prevBookings.map((b) => {
            if (b.id !== completionModalBooking.id) return b;
            const updatedParticipants = b.participants.map((p) =>
              !p.service_status || p.service_status === "remaining"
                ? {
                    ...p,
                    service_status: "awaiting_confirmation" as FlatServiceStatus,
                  }
                : p
            );
            return recalculateBookingMetrics(b, updatedParticipants);
          })
        );

        toast.success(`Marked ${successCount} flats complete!`, {
          description: "Flats transitioned to awaiting resident confirmation.",
        });
        setCompletionModalBooking(null);
        await handleRefresh(true);
      } else {
        toast.error(lastError || "Could not complete flats.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Error submitting completion handoff.");
    } finally {
      setIsSubmittingHandoff(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "open":
      case "active":
      case "upcoming":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-medium">
            Active / Scheduled
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-[#6B7F5B]/20 text-[#2E3A2F] border-[#6B7F5B]/30 font-medium">
            Completed
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-medium">
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[#2E3A2F]/80">
            {status}
          </Badge>
        );
    }
  };

  const getFlatStatusBadge = (status?: FlatServiceStatus) => {
    switch (status) {
      case "verified":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300">
            <CheckCircle className="size-3 text-emerald-600" /> Resident Verified
          </span>
        );
      case "awaiting_confirmation":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300">
            <Clock className="size-3 text-amber-600" /> Vendor Complete (Awaiting Resident Sign-off)
          </span>
        );
      case "issue_reported":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-300">
            <AlertTriangle className="size-3 text-rose-600" /> Issue Reported
          </span>
        );
      case "remaining":
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2E3A2F]/70 bg-[#2E3A2F]/5 px-2 py-0.5 rounded-full border border-[#D9C9B2]">
            <Clock className="size-3 text-[#2E3A2F]/60" /> Pending Service
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6EE] pb-24 text-[#2E3A2F]">
      {/* Top Header Banner */}
      <header className="sticky top-0 z-30 bg-[#F8F6EE]/95 backdrop-blur-md border-b border-[#D9C9B2]/80 px-4 py-3 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#2E3A2F] text-[#F8F6EE] flex items-center justify-center font-bold text-lg shadow-sm">
              <Wrench className="size-5 text-[#C96F4F]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading font-bold text-lg sm:text-xl text-[#2E3A2F]">
                  Vendor Dashboard
                </h1>
                <Badge className="bg-[#C96F4F]/15 text-[#C96F4F] border-[#C96F4F]/30 text-xs px-2 py-0.5 font-semibold">
                  Partner Portal
                </Badge>
              </div>
              <p className="text-xs text-[#2E3A2F]/70">
                Service execution, flat dispatch & completion tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRefresh(false)}
              disabled={isRefreshing}
              className="border-[#D9C9B2] text-[#2E3A2F] hover:bg-[#D9C9B2]/30 cursor-pointer text-xs flex items-center gap-1.5 h-8"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <div className="flex items-center gap-2 pl-2 border-l border-[#D9C9B2]">
              <Avatar className="size-8 border border-[#D9C9B2]">
                <AvatarFallback className="bg-[#2E3A2F] text-[#F8F6EE] text-xs font-semibold">
                  {vendorInfo.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-xs font-semibold text-[#2E3A2F] leading-tight truncate max-w-[140px]">
                  {vendorInfo.name}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-[#6B7F5B] font-medium">
                  <ShieldCheck className="size-3" />
                  <span>Authorized Vendor</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Vendor Partner Identity Alert / Card */}
        <div className="bg-[#2E3A2F] text-[#F8F6EE] rounded-2xl p-4 sm:p-5 shadow-sm border border-[#2E3A2F]/20 relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-[#C96F4F]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-semibold text-[#D9C9B2]">
                  Assigned Provider
                </span>
                <span className="size-1 rounded-full bg-[#C96F4F]" />
                <span className="text-xs text-[#D9C9B2]">{vendorInfo.societyName || "Palm Meadows Housing Society"}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-heading text-[#F8F6EE]">
                {vendorInfo.name}
              </h2>
              <p className="text-xs text-[#F8F6EE]/80 max-w-xl">
                Only assigned service pools for your vendor profile are displayed. All actions follow server-side authorization and strict verification segregation.
              </p>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 border-t sm:border-t-0 sm:border-l border-white/10 pt-3 sm:pt-0 sm:pl-5">
              <div className="text-left sm:text-right">
                <p className="text-[11px] text-[#D9C9B2]">Verification Standard</p>
                <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1 sm:justify-end">
                  <ShieldCheck className="size-3.5" /> Two-Party Protocol
                </p>
              </div>
              <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/80">
                Vendor Complete ≠ Resident Verified
              </span>
            </div>
          </div>
        </div>

        {/* Aggregate Stats Cards */}
        <section aria-label="Vendor Overview Metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="bg-[#FAF9F5] border-[#D9C9B2] shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-[#2E3A2F]/70">Assigned Bookings</p>
              <div className="flex items-baseline justify-between mt-1">
                <h3 className="text-2xl font-bold font-heading text-[#2E3A2F]">
                  {aggregates.totalBookings}
                </h3>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {aggregates.activeBookings} Active
                </span>
              </div>
              <p className="text-[11px] text-[#2E3A2F]/60 mt-2">
                Across housing societies
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#FAF9F5] border-[#D9C9B2] shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-[#2E3A2F]/70">Pending Service</p>
              <div className="flex items-baseline justify-between mt-1">
                <h3 className="text-2xl font-bold font-heading text-[#C96F4F]">
                  {aggregates.totalRemaining}
                </h3>
                <span className="text-xs text-[#2E3A2F]/60">
                  of {aggregates.totalFlats} total
                </span>
              </div>
              <p className="text-[11px] text-[#2E3A2F]/60 mt-2">
                Flats awaiting vendor visit
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#FAF9F5] border-[#D9C9B2] shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-amber-900">Vendor Marked Complete</p>
              <div className="flex items-baseline justify-between mt-1">
                <h3 className="text-2xl font-bold font-heading text-amber-700">
                  {aggregates.totalAwaiting}
                </h3>
                <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Awaiting Sign-off
                </span>
              </div>
              <p className="text-[11px] text-[#2E3A2F]/60 mt-2">
                Pending resident verification
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#FAF9F5] border-[#D9C9B2] shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-emerald-900">Resident Verified</p>
              <div className="flex items-baseline justify-between mt-1">
                <h3 className="text-2xl font-bold font-heading text-emerald-700">
                  {aggregates.totalVerifiedFlats}
                </h3>
                <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Confirmed
                </span>
              </div>
              <p className="text-[11px] text-[#2E3A2F]/60 mt-2">
                Confirmed complete by residents
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Filter and Search Bar */}
        <section aria-label="Bookings Filter and Search" className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#FAF9F5] p-3 rounded-xl border border-[#D9C9B2]">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === "all"
                  ? "bg-[#2E3A2F] text-[#F8F6EE] shadow-sm"
                  : "text-[#2E3A2F]/70 hover:bg-[#D9C9B2]/40"
              }`}
            >
              All ({bookings.length})
            </button>
            <button
              onClick={() => setStatusFilter("open")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === "open"
                  ? "bg-[#2E3A2F] text-[#F8F6EE] shadow-sm"
                  : "text-[#2E3A2F]/70 hover:bg-[#D9C9B2]/40"
              }`}
            >
              Active / Scheduled ({bookings.filter((b) => b.status === "open").length})
            </button>
            <button
              onClick={() => setStatusFilter("completed")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === "completed"
                  ? "bg-[#2E3A2F] text-[#F8F6EE] shadow-sm"
                  : "text-[#2E3A2F]/70 hover:bg-[#D9C9B2]/40"
              }`}
            >
              Completed ({bookings.filter((b) => b.status === "completed").length})
            </button>
            <button
              onClick={() => setStatusFilter("cancelled")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === "cancelled"
                  ? "bg-[#2E3A2F] text-[#F8F6EE] shadow-sm"
                  : "text-[#2E3A2F]/70 hover:bg-[#D9C9B2]/40"
              }`}
            >
              Cancelled ({bookings.filter((b) => b.status === "cancelled").length})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#2E3A2F]/50" />
            <input
              type="text"
              placeholder="Search service, society, flat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#D9C9B2] rounded-lg text-xs text-[#2E3A2F] placeholder-[#2E3A2F]/50 focus:outline-none focus:ring-1 focus:ring-[#C96F4F]"
            />
          </div>
        </section>

        {/* Assigned Bookings List */}
        <section aria-label="Assigned Service Pools" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold font-heading text-[#2E3A2F] flex items-center gap-2">
              <span>Assigned Service Bookings</span>
              <span className="text-xs font-normal text-[#2E3A2F]/60">
                ({filteredBookings.length} {filteredBookings.length === 1 ? "booking" : "bookings"})
              </span>
            </h2>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="bg-[#FAF9F5] border border-dashed border-[#D9C9B2] rounded-2xl p-8 sm:p-12 text-center space-y-3">
              <div className="size-12 rounded-full bg-[#D9C9B2]/40 flex items-center justify-center mx-auto text-[#2E3A2F]/60">
                <Wrench className="size-6 text-[#C96F4F]" />
              </div>
              <h3 className="text-base font-bold text-[#2E3A2F]">No Service Bookings Found</h3>
              <p className="text-xs text-[#2E3A2F]/70 max-w-sm mx-auto">
                {searchQuery || statusFilter !== "all"
                  ? "No bookings matched your filter criteria. Try resetting your search or selecting 'All'."
                  : `No pool bookings are currently assigned to ${vendorInfo.name}. When the society admin assigns events to your business, they will appear here.`}
              </p>
              {(searchQuery || statusFilter !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                  }}
                  className="border-[#D9C9B2] text-xs mt-2"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            filteredBookings.map((booking) => {
              const isExpanded = expandedBookingId === booking.id;

              return (
                <Card
                  key={booking.id}
                  className="bg-[#FAF9F5] border-[#D9C9B2] shadow-sm hover:shadow transition-shadow overflow-hidden"
                >
                  <CardHeader className="p-4 sm:p-5 border-b border-[#D9C9B2]/60 pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {getStatusBadge(booking.status)}
                          <span className="text-xs font-medium text-[#C96F4F] bg-[#C96F4F]/10 px-2 py-0.5 rounded">
                            {booking.service_type}
                          </span>
                        </div>
                        <CardTitle className="text-lg font-bold font-heading text-[#2E3A2F] mt-1">
                          {booking.title}
                        </CardTitle>
                      </div>

                      {/* Primary Actions */}
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setExpandedBookingId(isExpanded ? null : booking.id)
                          }
                          className="border-[#D9C9B2] text-xs h-8 cursor-pointer flex items-center gap-1.5"
                        >
                          <span>{isExpanded ? "Hide Flats" : "View Flats"}</span>
                          {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </Button>

                        {/* Completion Action: authorized vendor only */}
                        <Button
                          size="sm"
                          onClick={() => {
                            setCompletionModalBooking(booking);
                            setApiVerificationResult(null);
                          }}
                          disabled={booking.status === "cancelled"}
                          className="bg-[#2E3A2F] hover:bg-[#2E3A2F]/90 text-[#F8F6EE] text-xs h-8 cursor-pointer flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="size-3.5 text-[#C96F4F]" />
                          <span>Complete Service</span>
                        </Button>
                      </div>
                    </div>

                    {/* Metadata Subheader: Society and Slot Time */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs text-[#2E3A2F]/80">
                      <div className="flex items-center gap-1.5">
                        <Building className="size-3.5 text-[#C96F4F]" />
                        <span>Society: </span>
                        <strong className="text-[#2E3A2F]">{booking.society_name}</strong>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-3.5 text-[#6B7F5B]" />
                        <span>Scheduled Slot: </span>
                        <strong className="text-[#2E3A2F]">
                          {formatSlotTime(booking.slot_time)}
                        </strong>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 sm:p-5 space-y-4">
                    {/* Progress Bar (Operational Dispatch vs Resident Verification) */}
                    <div className="space-y-1.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                        <span className="font-semibold text-[#2E3A2F]">
                          Operational Dispatch Progress
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#C96F4F]">
                            {booking.vendorCompletedFlats} of {booking.totalFlats} flats completed by vendor ({booking.progressPercent}%)
                          </span>
                          <span className="text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300 font-medium">
                            {booking.verifiedFlats} Resident Verified
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-[#D9C9B2]/40 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-[#C96F4F] h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${booking.progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Flat Status Counters Breakdown (Strictly Separated) */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-center">
                      <div className="bg-white p-2 rounded-lg border border-[#D9C9B2]/70">
                        <p className="text-[10px] text-[#2E3A2F]/70 font-medium">Total Enrolled</p>
                        <p className="text-base font-bold text-[#2E3A2F]">{booking.totalFlats}</p>
                        <p className="text-[9px] text-[#2E3A2F]/50">Flats in pool</p>
                      </div>

                      <div className="bg-white p-2 rounded-lg border border-[#D9C9B2]/70">
                        <p className="text-[10px] text-[#2E3A2F]/70 font-medium">Pending Service</p>
                        <p className="text-base font-bold text-[#C96F4F]">{booking.remainingFlats}</p>
                        <p className="text-[9px] text-[#2E3A2F]/50">Awaiting vendor</p>
                      </div>

                      <div className="bg-white p-2 rounded-lg border border-amber-200 bg-amber-50/40">
                        <p className="text-[10px] text-amber-900 font-medium">Vendor Complete</p>
                        <p className="text-base font-bold text-amber-700">{booking.awaitingConfirmationFlats}</p>
                        <p className="text-[9px] text-amber-800/70">Awaiting sign-off</p>
                      </div>

                      <div className="bg-white p-2 rounded-lg border border-emerald-200 bg-emerald-50/40">
                        <p className="text-[10px] text-emerald-900 font-medium">Resident Verified</p>
                        <p className="text-base font-bold text-emerald-700">{booking.verifiedFlats}</p>
                        <p className="text-[9px] text-emerald-800/70">Confirmed complete</p>
                      </div>

                      <div className="bg-white p-2 rounded-lg border border-rose-200 bg-rose-50/40 col-span-2 sm:col-span-1">
                        <p className="text-[10px] text-rose-900 font-medium">Issue Reported</p>
                        <p className="text-base font-bold text-rose-700">{booking.issueReportedFlats}</p>
                        <p className="text-[9px] text-rose-800/70">Requires resolution</p>
                      </div>
                    </div>

                    {/* Participating Flats Accordion / Details */}
                    {isExpanded && (
                      <div className="pt-3 border-t border-[#D9C9B2]/60 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-[#2E3A2F]/80">
                            Participating Flats Dispatch Manifest ({booking.participants.length})
                          </h4>
                          <span className="text-[11px] text-[#2E3A2F]/60">
                            Live resident roster
                          </span>
                        </div>

                        {booking.participants.length === 0 ? (
                          <p className="text-xs text-[#2E3A2F]/60 italic py-2">
                            No flats have enrolled in this booking pool yet.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {booking.participants.map((participant) => (
                              <div
                                key={participant.id}
                                className="bg-white p-2.5 rounded-lg border border-[#D9C9B2] flex items-center justify-between gap-2 shadow-2xs"
                              >
                                <div className="space-y-0.5">
                                  <p className="text-xs font-bold text-[#2E3A2F]">
                                    {participant.flat_no}
                                  </p>
                                  {participant.joined_at && (
                                    <p className="text-[10px] text-[#2E3A2F]/60">
                                      Joined {new Date(participant.joined_at).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {getFlatStatusBadge(participant.service_status)}
                                  {(!participant.service_status || participant.service_status === "remaining") && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={completingFlatId === participant.id}
                                      onClick={() =>
                                        handleCompleteFlat(
                                          participant.id,
                                          booking.id,
                                          participant.flat_no
                                        )
                                      }
                                      className="h-6 text-[10px] px-2 border-[#D9C9B2] hover:bg-[#D9C9B2]/20 cursor-pointer text-[#2E3A2F] flex items-center gap-1"
                                    >
                                      {completingFlatId === participant.id ? (
                                        <Loader2 className="size-3 animate-spin" />
                                      ) : (
                                        "Mark Complete"
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>
      </main>

      {/* Service Completion Modal: Architectural Dependency & Verification State */}
      <Dialog
        open={Boolean(completionModalBooking)}
        onOpenChange={(open) => {
          if (!open) {
            setCompletionModalBooking(null);
            setApiVerificationResult(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-[#FAF9F5] border-[#D9C9B2] text-[#2E3A2F]">
          <DialogHeader>
            <div className="flex items-center gap-2 text-[#C96F4F]">
              <Wrench className="size-5" />
              <DialogTitle className="font-heading font-bold text-lg text-[#2E3A2F]">
                Service Completion Handoff
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[#2E3A2F]/70">
              {completionModalBooking?.title} &bull; {completionModalBooking?.society_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {/* Flats summary chip */}
            <div className="bg-white p-3 rounded-lg border border-[#D9C9B2] space-y-1">
              <div className="flex justify-between">
                <span className="text-[#2E3A2F]/70">Total Participating Units:</span>
                <strong className="text-[#2E3A2F]">{completionModalBooking?.totalFlats} Flats</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#2E3A2F]/70">Action Scope:</span>
                <span className="text-amber-800 font-medium">
                  Mark as Awaiting Resident Confirmation
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#2E3A2F]/70">Resident Verification:</span>
                <span className="text-emerald-800 font-medium">Independent (Segregated)</span>
              </div>
            </div>

            {/* Strict Two-Party Architecture Rule Notice */}
            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-blue-950">
                <ShieldCheck className="size-4 text-blue-700" />
                <span>Security Protocol: Segregated Resident Sign-Off</span>
              </div>
              <p className="text-[11px] leading-relaxed text-blue-900/90">
                In SocietyPool, a vendor marking a service complete transitions flats to <em>awaiting confirmation</em>. It <strong>never</strong> marks services as resident-verified. Each resident must independently confirm service satisfaction from their dashboard.
              </p>
            </div>

            {/* Backend Dependency Status Callout */}
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-amber-950">
                <AlertTriangle className="size-4 text-amber-700" />
                <span>Backend Completion API Dependency</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-900/90">
                The database requires the pending migration for the secure server RPC <code>complete_vendor_booking</code> and the <code>participants.service_status</code> column. Client-side fake completions are strictly disallowed.
              </p>

              {apiVerificationResult && (
                <div
                  className={`p-2 rounded text-[11px] font-mono ${
                    apiVerificationResult.available
                      ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                      : "bg-amber-100/80 text-amber-950 border border-amber-300"
                  }`}
                >
                  {apiVerificationResult.message}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestCompletionApi}
                disabled={isCheckingApi}
                className="w-full border-amber-300 bg-white hover:bg-amber-100/50 text-amber-900 text-xs h-8 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isCheckingApi ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Checking Supabase Schema Cache...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3.5" />
                    <span>Verify Backend Completion RPC</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCompletionModalBooking(null);
                setApiVerificationResult(null);
              }}
              className="border-[#D9C9B2] text-xs"
            >
              Close
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={isSubmittingHandoff}
              onClick={handleBatchCompleteBooking}
              className="bg-[#2E3A2F] hover:bg-[#2E3A2F]/90 text-[#F8F6EE] text-xs cursor-pointer flex items-center gap-1.5"
            >
              {isSubmittingHandoff && <Loader2 className="size-3.5 animate-spin" />}
              <span>Submit Completion Handoff</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
