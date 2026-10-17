/**
 * SocietyPool Automated Service Lifecycle Test Suite & Boundary Verification
 * Tests the complete lifecycle, security policies, and state transitions
 */

// Define test state fixtures
interface MockParticipant {
  id: string;
  event_id: string;
  user_id: string;
  flat_no: string;
  joined_at: string;
  service_status: "remaining" | "awaiting_confirmation" | "verified" | "issue_reported";
  issue_description?: string;
  resident_verified_at?: string;
  vendor_completed_at?: string;
  vendor_completed_by?: string;
}

interface MockEvent {
  id: string;
  title: string;
  vendor_name: string;
  vendor_id?: string;
  status: string;
}

interface MockUser {
  id: string;
  name: string;
  role: "resident" | "admin" | "vendor";
}

function createMockEnvironment() {
  const users: Record<string, MockUser> = {
    "user-resident-1": { id: "user-resident-1", name: "Rahul Resident", role: "resident" },
    "user-resident-2": { id: "user-resident-2", name: "Priya Resident", role: "resident" },
    "user-vendor-1": { id: "user-vendor-1", name: "CoolCare Express", role: "vendor" },
    "user-vendor-2": { id: "user-vendor-2", name: "Other Cleaners", role: "vendor" },
    "user-admin-1": { id: "user-admin-1", name: "Secretary Admin", role: "admin" },
  };

  const events: Record<string, MockEvent> = {
    "event-1": {
      id: "event-1",
      title: "AC Deep Cleaning",
      vendor_name: "CoolCare Express",
      status: "open",
    },
    "event-cancelled": {
      id: "event-cancelled",
      title: "Cancelled Pest Control",
      vendor_name: "CoolCare Express",
      status: "cancelled",
    },
  };

  const participants: Record<string, MockParticipant> = {
    "part-pending": {
      id: "part-pending",
      event_id: "event-1",
      user_id: "user-resident-1",
      flat_no: "B-402",
      joined_at: new Date().toISOString(),
      service_status: "remaining",
    },
    "part-awaiting": {
      id: "part-awaiting",
      event_id: "event-1",
      user_id: "user-resident-1",
      flat_no: "B-402",
      joined_at: new Date().toISOString(),
      service_status: "awaiting_confirmation",
      vendor_completed_by: "CoolCare Express",
      vendor_completed_at: new Date().toISOString(),
    },
    "part-verified": {
      id: "part-verified",
      event_id: "event-1",
      user_id: "user-resident-1",
      flat_no: "B-402",
      joined_at: new Date().toISOString(),
      service_status: "verified",
      resident_verified_at: new Date().toISOString(),
    },
    "part-reported": {
      id: "part-reported",
      event_id: "event-1",
      user_id: "user-resident-1",
      flat_no: "B-402",
      joined_at: new Date().toISOString(),
      service_status: "issue_reported",
      issue_description: "Filter unwashed",
    },
    "part-other-resident": {
      id: "part-other-resident",
      event_id: "event-1",
      user_id: "user-resident-2",
      flat_no: "C-101",
      joined_at: new Date().toISOString(),
      service_status: "awaiting_confirmation",
    },
  };

  return { users, events, participants };
}

// -----------------------------------------------------------------------------
// VENDOR COMPLETION ENGINE (Mirrors src/app/api/vendor/completion/route.ts)
// -----------------------------------------------------------------------------
function executeVendorCompletion(
  env: ReturnType<typeof createMockEnvironment>,
  auth: { user?: MockUser | null; demoRole?: string | null },
  body: { participant_id?: any; event_id?: any }
) {
  // 1. Authenticate
  if (!auth.user && !auth.demoRole) {
    return { status: 401, data: { error: "Unauthorized: Authentication required." } };
  }

  // 2. Authorize role
  let role = auth.user ? auth.user.role : auth.demoRole;
  if (role !== "vendor" && role !== "admin") {
    return {
      status: 403,
      data: { error: "Forbidden: Only authorized vendors can record service completions." },
    };
  }

  // 3. Resolve vendor identity
  let vendorName = "";
  if (auth.user) {
    vendorName = auth.user.name;
  } else if (auth.demoRole === "vendor") {
    vendorName = "CoolCare Express";
  }

  // 4. Validate body
  const { participant_id, event_id } = body;
  if (!participant_id || typeof participant_id !== "string" || !participant_id.trim()) {
    return { status: 400, data: { error: "Bad Request: participant_id is required." } };
  }

  // 5. Query participant
  const participant = env.participants[participant_id.trim()];
  if (!participant) {
    return { status: 404, data: { error: "Not Found: Participant flat record does not exist." } };
  }

  if (event_id && participant.event_id !== event_id) {
    return {
      status: 400,
      data: { error: "Bad Request: Participant does not belong to the specified event." },
    };
  }

  // 6. Query event
  const event = env.events[participant.event_id];
  if (!event) {
    return { status: 404, data: { error: "Not Found: Associated booking event does not exist." } };
  }

  if (event.status === "cancelled") {
    return {
      status: 400,
      data: { error: "Bad Request: Cannot record service completion for a cancelled booking." },
    };
  }

  // 7. Verify vendor assignment
  const isAssigned =
    role === "admin" ||
    (Boolean(vendorName) &&
      Boolean(event.vendor_name) &&
      vendorName.trim().toLowerCase() === event.vendor_name.trim().toLowerCase());

  if (!isAssigned) {
    return {
      status: 403,
      data: {
        error:
          "Forbidden: You are not the assigned vendor for this booking. You cannot update flats for another provider.",
      },
    };
  }

  // 8. Prevent duplicate or invalid transitions
  if (participant.service_status === "awaiting_confirmation") {
    return {
      status: 409,
      data: {
        error:
          "Conflict: This flat has already been marked complete by the vendor and is awaiting resident confirmation.",
        status: "awaiting_confirmation",
      },
    };
  }

  if (participant.service_status === "verified") {
    return {
      status: 409,
      data: {
        error:
          "Conflict: This flat has already been verified by the resident. Vendor cannot modify a verified flat.",
        status: "verified",
      },
    };
  }

  // 9. Atomic transition to awaiting_confirmation
  participant.service_status = "awaiting_confirmation";
  participant.vendor_completed_by = vendorName;
  participant.vendor_completed_at = new Date().toISOString();

  return {
    status: 200,
    data: {
      success: true,
      participant_id: participant.id,
      flat_no: participant.flat_no,
      status: "awaiting_confirmation",
    },
  };
}

// -----------------------------------------------------------------------------
// RESIDENT VERIFICATION ENGINE (Mirrors src/app/api/resident/verification/route.ts)
// -----------------------------------------------------------------------------
function executeResidentVerification(
  env: ReturnType<typeof createMockEnvironment>,
  auth: { user?: MockUser | null; demoRole?: string | null },
  body: { participant_id?: any; action?: any; issue_description?: any }
) {
  // 1. Authenticate
  if (!auth.user && !auth.demoRole) {
    return { status: 401, data: { error: "Unauthorized: Authentication required." } };
  }

  // 2. Authorize role: vendors cannot verify their own service
  let role = auth.user ? auth.user.role : auth.demoRole;
  if (role === "vendor") {
    return {
      status: 403,
      data: {
        error:
          "Forbidden: Vendors cannot verify their own service. Only the resident can confirm completion or report an issue.",
      },
    };
  }

  // 3. Validate body
  const { participant_id, action, issue_description } = body;
  if (!participant_id || typeof participant_id !== "string" || !participant_id.trim()) {
    return { status: 400, data: { error: "Bad Request: participant_id is required." } };
  }

  if (action !== "verify" && action !== "report_issue") {
    return {
      status: 400,
      data: { error: "Bad Request: action must be either 'verify' or 'report_issue'." },
    };
  }

  if (action === "report_issue") {
    if (
      !issue_description ||
      typeof issue_description !== "string" ||
      issue_description.trim().length < 3
    ) {
      return {
        status: 400,
        data: {
          error:
            "Bad Request: A descriptive issue description (at least 3 characters) is required when reporting an issue.",
        },
      };
    }
  }

  // 4. Query participant
  const participant = env.participants[participant_id.trim()];
  if (!participant) {
    return { status: 404, data: { error: "Not Found: Participant flat record does not exist." } };
  }

  // 5. Enforce strict resident ownership
  const isOwner =
    role === "admin" ||
    (Boolean(auth.user?.id) && participant.user_id === auth.user?.id) ||
    (!auth.user && auth.demoRole === "resident" && participant.user_id === "user-resident-1");

  if (!isOwner) {
    return {
      status: 403,
      data: {
        error:
          "Forbidden: You can only confirm completion or report issues for your own flat participation.",
      },
    };
  }

  // 6. Check invalid/duplicate transitions
  if (participant.service_status === "verified") {
    return {
      status: 409,
      data: {
        error:
          "Conflict: This service has already been verified and confirmed complete by the resident.",
        status: "verified",
      },
    };
  }

  if (participant.service_status === "issue_reported" && action === "report_issue") {
    return {
      status: 409,
      data: {
        error: "Conflict: An issue has already been reported for this service.",
        status: "issue_reported",
      },
    };
  }

  if (participant.service_status === "remaining") {
    return {
      status: 400,
      data: {
        error:
          "Bad Request: This service is pending and has not yet been marked complete by the vendor.",
        status: "remaining",
      },
    };
  }

  // 7. Atomic update
  const targetStatus = action === "verify" ? "verified" : "issue_reported";
  participant.service_status = targetStatus;

  if (action === "verify") {
    participant.resident_verified_at = new Date().toISOString();
  } else {
    participant.issue_description = issue_description.trim();
  }

  return {
    status: 200,
    data: {
      success: true,
      participant_id: participant.id,
      flat_no: participant.flat_no,
      status: targetStatus,
    },
  };
}

// -----------------------------------------------------------------------------
// TEST RUNNER & ASSERTIONS
// -----------------------------------------------------------------------------
async function runTests() {
  console.log("===============================================================");
  console.log("SOCIETYPOOL SERVICE LIFECYCLE & SECURITY BOUNDARY AUDIT SUITE");
  console.log("===============================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}: ${detail || "Condition not met"}`);
      failed++;
    }
  }

  const env = createMockEnvironment();

  // Test 1: Vendor API unauthenticated -> 401
  const t1 = executeVendorCompletion(env, {}, { participant_id: "part-pending" });
  assert("Vendor API: Unauthenticated request returns 401", t1.status === 401);

  // Test 2: Vendor API with resident role -> 403
  const t2 = executeVendorCompletion(
    env,
    { user: env.users["user-resident-1"] },
    { participant_id: "part-pending" }
  );
  assert(
    "Vendor API: Resident-role request returns 403 Forbidden",
    t2.status === 403 && Boolean(t2.data.error?.includes("Only authorized vendors"))
  );

  // Test 3: Vendor API unassigned vendor -> 403
  const t3 = executeVendorCompletion(
    env,
    { user: env.users["user-vendor-2"] }, // "Other Cleaners", but event belongs to "CoolCare Express"
    { participant_id: "part-pending" }
  );
  assert(
    "Vendor API: Unassigned vendor returns 403 Forbidden",
    t3.status === 403 && Boolean(t3.data.error?.includes("You are not the assigned vendor"))
  );

  // Test 4: Vendor API missing participant ID -> 400
  const t4 = executeVendorCompletion(
    env,
    { user: env.users["user-vendor-1"] },
    { participant_id: "" }
  );
  assert("Vendor API: Empty participant ID returns 400 Bad Request", t4.status === 400);

  // Test 5: Vendor API nonexistent participant -> 404
  const t5 = executeVendorCompletion(
    env,
    { user: env.users["user-vendor-1"] },
    { participant_id: "nonexistent-id" }
  );
  assert("Vendor API: Nonexistent participant returns 404 Not Found", t5.status === 404);

  // Test 6: Vendor API cancelled event -> 400
  const envCancelled = createMockEnvironment();
  envCancelled.participants["part-pending"].event_id = "event-cancelled";
  const t6 = executeVendorCompletion(
    envCancelled,
    { user: envCancelled.users["user-vendor-1"] },
    { participant_id: "part-pending" }
  );
  assert("Vendor API: Cancelled booking returns 400 Bad Request", t6.status === 400);

  // Test 7: Vendor API valid vendor marks complete -> transitions to awaiting_confirmation (never verified!)
  const env7 = createMockEnvironment();
  const t7 = executeVendorCompletion(
    env7,
    { user: env7.users["user-vendor-1"] },
    { participant_id: "part-pending" }
  );
  assert(
    "Vendor API: Authorized vendor transitions pending flat to awaiting_confirmation",
    t7.status === 200 &&
      t7.data.status === "awaiting_confirmation" &&
      env7.participants["part-pending"].service_status === "awaiting_confirmation"
  );
  assert(
    "Vendor API: Vendor action NEVER sets status directly to verified",
    t7.data.status !== "verified" &&
      env7.participants["part-pending"].service_status !== "verified"
  );

  // Test 8: Vendor API duplicate completion -> 409
  const t8 = executeVendorCompletion(
    env,
    { user: env.users["user-vendor-1"] },
    { participant_id: "part-awaiting" }
  );
  assert(
    "Vendor API: Duplicate completion returns 409 Conflict",
    t8.status === 409 && t8.data.status === "awaiting_confirmation"
  );

  // Test 9: Vendor API attempt to overwrite resident-verified flat -> 409
  const t9 = executeVendorCompletion(
    env,
    { user: env.users["user-vendor-1"] },
    { participant_id: "part-verified" }
  );
  assert(
    "Vendor API: Attempt to overwrite resident-verified flat returns 409 Conflict",
    t9.status === 409 && t9.data.status === "verified"
  );

  // Test 10: Resident API unauthenticated -> 401
  const t10 = executeResidentVerification(env, {}, { participant_id: "part-awaiting", action: "verify" });
  assert("Resident API: Unauthenticated request returns 401 Unauthorized", t10.status === 401);

  // Test 11: Resident API vendor attempting resident action -> 403
  const t11 = executeResidentVerification(
    env,
    { user: env.users["user-vendor-1"] },
    { participant_id: "part-awaiting", action: "verify" }
  );
  assert(
    "Resident API: Vendor attempting resident verification returns 403 Forbidden",
    t11.status === 403 && Boolean(t11.data.error?.includes("Vendors cannot verify their own service"))
  );

  // Test 12: Resident API verifying another resident's flat -> 403
  const t12 = executeResidentVerification(
    env,
    { user: env.users["user-resident-1"] }, // Rahul tries to verify Priya's flat
    { participant_id: "part-other-resident", action: "verify" }
  );
  assert(
    "Resident API: Resident verifying another resident's flat returns 403 Forbidden",
    t12.status === 403 && Boolean(t12.data.error?.includes("You can only confirm completion or report issues for your own flat"))
  );

  // Test 13: Resident API verifying pending service (not yet completed by vendor) -> 400
  const t13 = executeResidentVerification(
    env,
    { user: env.users["user-resident-1"] },
    { participant_id: "part-pending", action: "verify" }
  );
  assert(
    "Resident API: Verifying flat before vendor completion returns 400 Bad Request",
    t13.status === 400 && Boolean(t13.data.error?.includes("has not yet been marked complete by the vendor"))
  );

  // Test 14: Resident API valid confirmation on awaiting_confirmation -> verified
  const env14 = createMockEnvironment();
  const t14 = executeResidentVerification(
    env14,
    { user: env14.users["user-resident-1"] },
    { participant_id: "part-awaiting", action: "verify" }
  );
  assert(
    "Resident API: Resident successfully confirms completion -> transitions to verified",
    t14.status === 200 &&
      t14.data.status === "verified" &&
      env14.participants["part-awaiting"].service_status === "verified"
  );

  // Test 15: Resident API duplicate confirmation when already verified -> 409
  const t15 = executeResidentVerification(
    env,
    { user: env.users["user-resident-1"] },
    { participant_id: "part-verified", action: "verify" }
  );
  assert(
    "Resident API: Duplicate verification returns 409 Conflict",
    t15.status === 409 && t15.data.status === "verified"
  );

  // Test 16: Resident API reporting issue with invalid/short description -> 400
  const t16 = executeResidentVerification(
    env,
    { user: env.users["user-resident-1"] },
    { participant_id: "part-awaiting", action: "report_issue", issue_description: "no" }
  );
  assert("Resident API: Short issue description returns 400 Bad Request", t16.status === 400);

  // Test 17: Resident API reporting valid issue -> transitions to issue_reported
  const env17 = createMockEnvironment();
  const t17 = executeResidentVerification(
    env17,
    { user: env17.users["user-resident-1"] },
    {
      participant_id: "part-awaiting",
      action: "report_issue",
      issue_description: "Technician missed cleaning the AC filter",
    }
  );
  assert(
    "Resident API: Valid issue report transitions to issue_reported with logged note",
    t17.status === 200 &&
      t17.data.status === "issue_reported" &&
      env17.participants["part-awaiting"].service_status === "issue_reported" &&
      env17.participants["part-awaiting"].issue_description === "Technician missed cleaning the AC filter"
  );

  // Test 18: Resident API duplicate issue report -> 409
  const t18 = executeResidentVerification(
    env,
    { user: env.users["user-resident-1"] },
    {
      participant_id: "part-reported",
      action: "report_issue",
      issue_description: "Another note",
    }
  );
  assert("Resident API: Duplicate issue report returns 409 Conflict", t18.status === 409);

  // Test 19: Demo Vendor Cookie Access & Assignment Test
  const env19 = createMockEnvironment();
  const t19 = executeVendorCompletion(
    env19,
    { demoRole: "vendor" }, // CoolCare Express demo
    { participant_id: "part-pending" }
  );
  assert(
    "Vendor API: Demo vendor cookie transitions flat to awaiting_confirmation",
    t19.status === 200 && t19.data.status === "awaiting_confirmation"
  );

  // Test 20: Admin Supervisor Override
  const env20 = createMockEnvironment();
  const t20 = executeVendorCompletion(
    env20,
    { user: env20.users["user-admin-1"] },
    { participant_id: "part-pending" }
  );
  assert("Vendor API: Admin supervisor can mark service completion", t20.status === 200);

  console.log("\n===============================================================");
  console.log(`AUDIT RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total checks)`);
  console.log("===============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
