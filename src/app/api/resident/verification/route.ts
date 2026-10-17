import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate user server-side from session / cookies
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

    // 2. Authorize role: only residents (and admin supervisors) can confirm service
    const userRole = await getUserRole(supabase, user, demoRole);

    if (userRole === "vendor") {
      return NextResponse.json(
        {
          error:
            "Forbidden: Vendors cannot verify their own service. Only the resident can confirm completion or report an issue.",
        },
        { status: 403 }
      );
    }

    // 3. Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const { participant_id, action, issue_description } = body;

    if (!participant_id || typeof participant_id !== "string" || !participant_id.trim()) {
      return NextResponse.json(
        { error: "Bad Request: participant_id is required." },
        { status: 400 }
      );
    }

    if (action !== "verify" && action !== "report_issue") {
      return NextResponse.json(
        {
          error:
            "Bad Request: action must be either 'verify' or 'report_issue'.",
        },
        { status: 400 }
      );
    }

    if (action === "report_issue") {
      if (
        !issue_description ||
        typeof issue_description !== "string" ||
        issue_description.trim().length < 3
      ) {
        return NextResponse.json(
          {
            error:
              "Bad Request: A descriptive issue description (at least 3 characters) is required when reporting an issue.",
          },
          { status: 400 }
        );
      }
    }

    // 4. Query participant record strictly from database
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

    // 5. Enforce strict server-side resident authorization:
    // Residents can update ONLY their own participation record
    let userFlatNo: string | null = null;
    if (user?.id) {
      try {
        const { data: userProfile } = await supabase
          .from("users")
          .select("flat_no")
          .eq("id", user.id)
          .maybeSingle();
        if (userProfile?.flat_no) userFlatNo = userProfile.flat_no.trim().toLowerCase();
      } catch {
        // ignore
      }
    }

    const partFlat = (participant.flat_no || "").trim().toLowerCase();
    const isOwner =
      userRole === "admin" ||
      (Boolean(user?.id) && participant.user_id === user?.id) ||
      (Boolean(userFlatNo) && Boolean(partFlat) && partFlat === userFlatNo) ||
      (!user && demoRole === "resident");

    if (!isOwner) {
      return NextResponse.json(
        {
          error:
            "Forbidden: You can only confirm completion or report issues for your own flat participation.",
        },
        { status: 403 }
      );
    }

    // 6. Inspect current flat service status to prevent invalid or duplicate transitions
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

    // Check invalid / duplicate status transitions
    if (currentStatus === "verified") {
      return NextResponse.json(
        {
          error:
            "Conflict: This service has already been verified and confirmed complete by the resident.",
          status: "verified",
        },
        { status: 409 }
      );
    }

    if (currentStatus === "issue_reported" && action === "report_issue") {
      return NextResponse.json(
        {
          error:
            "Conflict: An issue has already been reported for this service.",
          status: "issue_reported",
        },
        { status: 409 }
      );
    }

    if (!currentStatus || currentStatus === "remaining") {
      return NextResponse.json(
        {
          error:
            "Bad Request: This service is pending and has not yet been marked complete by the vendor.",
          status: "remaining",
        },
        { status: 400 }
      );
    }

    // Must be in 'awaiting_confirmation' (or resolving an 'issue_reported' to 'verified')
    const allowedSourceStatuses =
      action === "verify" ? ["awaiting_confirmation", "issue_reported"] : ["awaiting_confirmation"];

    if (!allowedSourceStatuses.includes(currentStatus)) {
      return NextResponse.json(
        {
          error: `Bad Request: Cannot transition from '${currentStatus}' with action '${action}'.`,
          status: currentStatus,
        },
        { status: 400 }
      );
    }

    // 7. Perform atomic update based on action
    const targetStatus = action === "verify" ? "verified" : "issue_reported";
    const nowIso = new Date().toISOString();

    const fullPayload: Record<string, any> = {
      service_status: targetStatus,
    };

    if (action === "verify") {
      fullPayload.resident_verified_at = nowIso;
    } else {
      fullPayload.issue_description = issue_description.trim();
      fullPayload.issue_reported_at = nowIso;
    }

    let { data: updatedParticipant, error: updateError } = await supabase
      .from("participants")
      .update(fullPayload)
      .eq("id", participant.id)
      .in("service_status", allowedSourceStatuses)
      .select()
      .maybeSingle();

    // Graceful fallback if metadata columns (resident_verified_at/issue_description) are missing
    if (
      updateError &&
      (updateError.code === "PGRST204" ||
        updateError.message?.toLowerCase().includes("does not exist") ||
        updateError.message?.toLowerCase().includes("column"))
    ) {
      const minimalUpdate = await supabase
        .from("participants")
        .update({ service_status: targetStatus })
        .eq("id", participant.id)
        .in("service_status", allowedSourceStatuses)
        .select()
        .maybeSingle();

      updatedParticipant = minimalUpdate.data;
      updateError = minimalUpdate.error;
    }

    if (updateError || !updatedParticipant) {
      // Check for concurrent submission
      const { data: latest } = await supabase
        .from("participants")
        .select("service_status")
        .eq("id", participant.id)
        .single();

      if (latest && (latest as any).service_status !== currentStatus) {
        return NextResponse.json(
          {
            error:
              "Conflict: A concurrent submission has already updated this flat's service status.",
            status: (latest as any).service_status,
          },
          { status: 409 }
        );
      }

      console.error("Error updating resident service status:", updateError);
      return NextResponse.json(
        { error: updateError?.message || "Failed to update service status." },
        { status: 500 }
      );
    }

    const message =
      action === "verify"
        ? `Service for Flat ${participant.flat_no} has been verified and confirmed complete.`
        : `Service issue reported for Flat ${participant.flat_no}. Management and vendor have been alerted.`;

    return NextResponse.json({
      success: true,
      participant_id: participant.id,
      flat_no: participant.flat_no,
      status: targetStatus,
      action,
      message,
      updated: updatedParticipant,
    });
  } catch (error: any) {
    console.error("Resident service verification API error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
