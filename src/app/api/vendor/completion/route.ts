import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate user server-side from trusted session/cookies
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    let demoRole: string | undefined;
    try {
      const cookieStore = await cookies();
      demoRole = cookieStore.get("demo_role")?.value;
    } catch {
      // Fallback: parse from incoming request headers
    }
    if (!demoRole) {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(/demo_role=([^;]+)/);
      demoRole = match ? match[1] : undefined;
    }

    if (!user && !demoRole) {
      return NextResponse.json(
        { error: "Unauthorized: Authentication required." },
        { status: 401 }
      );
    }

    // 2. Authorize vendor role via single source of truth
    const userRole = await getUserRole(supabase, user, demoRole);

    if (userRole !== "vendor" && userRole !== "admin") {
      return NextResponse.json(
        {
          error:
            "Forbidden: Only authorized vendors can record service completions.",
        },
        { status: 403 }
      );
    }

    // 3. Resolve authenticated vendor's identity strictly from database profile / demo role
    let vendorName = "";
    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("name, role")
        .eq("id", user.id)
        .single();

      vendorName =
        (profile?.role === "vendor" ? profile?.name : null) ||
        user.user_metadata?.vendor_name ||
        (demoRole === "vendor" ? "CoolCare Express" : "") ||
        profile?.name ||
        user.user_metadata?.full_name ||
        "";
    } else if (demoRole === "vendor") {
      vendorName = "CoolCare Express";
    }

    // 4. Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const { participant_id, event_id } = body;

    if (!participant_id || typeof participant_id !== "string" || !participant_id.trim()) {
      return NextResponse.json(
        { error: "Bad Request: participant_id is required." },
        { status: 400 }
      );
    }

    // 5. Query participant record strictly from database
    const { data: participant, error: partError } = await supabase
      .from("participants")
      .select("id, event_id, user_id, flat_no, joined_at")
      .eq("id", participant_id.trim())
      .single();

    if (partError || !participant) {
      return NextResponse.json(
        { error: "Not Found: Participant flat record does not exist." },
        { status: 404 }
      );
    }

    // Verify consistency if event_id was also provided
    if (event_id && participant.event_id !== event_id) {
      return NextResponse.json(
        { error: "Bad Request: Participant does not belong to the specified event." },
        { status: 400 }
      );
    }

    // 6. Query parent booking event strictly from database
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, vendor_name, status")
      .eq("id", participant.event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Not Found: Associated booking event does not exist." },
        { status: 404 }
      );
    }

    if (event.status === "cancelled") {
      return NextResponse.json(
        { error: "Bad Request: Cannot record service completion for a cancelled booking." },
        { status: 400 }
      );
    }

    // 7. Verify vendor assignment strictly through database relationship
    // Never trust client-supplied vendor names
    const eventVendorId = (event as any)?.vendor_id;
    const isAssigned =
      userRole === "admin" ||
      (Boolean(eventVendorId) && Boolean(user?.id) && eventVendorId === user?.id) ||
      (Boolean(vendorName) &&
        Boolean(event.vendor_name) &&
        vendorName.trim().toLowerCase() === event.vendor_name.trim().toLowerCase());

    if (!isAssigned) {
      return NextResponse.json(
        {
          error:
            "Forbidden: You are not the assigned vendor for this booking. You cannot update flats for another provider.",
        },
        { status: 403 }
      );
    }

    // 8. Inspect current flat service status to prevent invalid or duplicate transitions
    // Probe if service_status column exists on participants
    const { data: partWithStatus, error: statusProbeError } = await supabase
      .from("participants")
      .select("service_status")
      .eq("id", participant.id)
      .single();

    if (
      statusProbeError &&
      (statusProbeError.code === "PGRST204" ||
        statusProbeError.message?.toLowerCase().includes("does not exist") ||
        statusProbeError.message?.toLowerCase().includes("column"))
    ) {
      // Column does not exist in live schema yet
      return NextResponse.json(
        {
          error: "Schema migration required",
          message:
            "Database column 'service_status' is not yet present on 'participants'. The database migration must be executed before service status can be recorded.",
          migration_required: true,
          required_ddl:
            "ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS service_status text NOT NULL DEFAULT 'remaining' CHECK (service_status IN ('remaining', 'awaiting_confirmation', 'verified', 'issue_reported'));",
        },
        { status: 501 }
      );
    }

    const currentStatus = (partWithStatus as any)?.service_status;

    // Duplicate submission prevention
    if (currentStatus === "awaiting_confirmation") {
      return NextResponse.json(
        {
          error:
            "Conflict: This flat has already been marked complete by the vendor and is awaiting resident confirmation.",
          status: "awaiting_confirmation",
        },
        { status: 409 }
      );
    }

    if (currentStatus === "verified") {
      return NextResponse.json(
        {
          error:
            "Conflict: This flat has already been verified by the resident. Vendor cannot modify a verified flat.",
          status: "verified",
        },
        { status: 409 }
      );
    }

    // 9. Perform update: Transition only to 'awaiting_confirmation'
    // CRITICAL SECURITY CONSTRAINT: NEVER set status to 'verified' from this vendor endpoint
    // Atomic state guard: only transition if current status is 'remaining' (or null)
    const fullPayload: Record<string, any> = {
      service_status: "awaiting_confirmation",
      vendor_completed_at: new Date().toISOString(),
      vendor_completed_by: vendorName || user?.id || "vendor",
    };

    let updateQuery = supabase
      .from("participants")
      .update(fullPayload)
      .eq("id", participant.id);

    if (currentStatus === "remaining") {
      updateQuery = updateQuery.eq("service_status", "remaining");
    } else {
      updateQuery = updateQuery.or("service_status.eq.remaining,service_status.is.null");
    }

    let { data: updatedParticipant, error: updateError } = await updateQuery
      .select()
      .maybeSingle();

    // If schema lacks vendor_completed_at column, retry with minimal service_status payload
    if (
      updateError &&
      (updateError.code === "PGRST204" ||
        updateError.message?.toLowerCase().includes("does not exist") ||
        updateError.message?.toLowerCase().includes("column"))
    ) {
      let minimalQuery = supabase
        .from("participants")
        .update({ service_status: "awaiting_confirmation" })
        .eq("id", participant.id);

      if (currentStatus === "remaining") {
        minimalQuery = minimalQuery.eq("service_status", "remaining");
      } else {
        minimalQuery = minimalQuery.or("service_status.eq.remaining,service_status.is.null");
      }

      const minimalUpdate = await minimalQuery.select().maybeSingle();
      updatedParticipant = minimalUpdate.data;
      updateError = minimalUpdate.error;
    }

    if (updateError || !updatedParticipant) {
      // Check if a concurrent request already transitioned this record
      const { data: latest } = await supabase
        .from("participants")
        .select("service_status")
        .eq("id", participant.id)
        .single();

      if (
        latest &&
        ((latest as any).service_status === "awaiting_confirmation" ||
          (latest as any).service_status === "verified")
      ) {
        return NextResponse.json(
          {
            error:
              "Conflict: A concurrent submission has already updated this flat's service status.",
            status: (latest as any).service_status,
          },
          { status: 409 }
        );
      }

      console.error("Error updating participant service_status:", updateError);
      return NextResponse.json(
        { error: updateError?.message || "Failed to update participant service status." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      participant_id: participant.id,
      flat_no: participant.flat_no,
      status: "awaiting_confirmation",
      message: `Flat ${participant.flat_no} marked complete by vendor. Status transitioned to awaiting resident confirmation.`,
      updated: updatedParticipant,
    });
  } catch (error: any) {
    console.error("Vendor service completion API error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
