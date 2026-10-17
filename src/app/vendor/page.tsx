import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import {
  VendorDashboard,
  type VendorBookingItem,
  type VendorFlatParticipant,
  type VendorInfo,
  type SocietyItem,
} from "@/components/vendor/vendor-dashboard";

// Allow dynamic blocking route for vendor data fetching in Next.js 16
export const instant = false;

export default async function VendorPage() {
  await connection();
  const supabase = await createClient();

  // Verify authentication and role strictly on the server
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const demoRole = cookieStore.get("demo_role")?.value;

  // Single source of truth for role authorization (public.users > metadata > demoRole)
  const userRole = await getUserRole(supabase, user, demoRole);

  if (userRole !== "vendor" && userRole !== "admin") {
    if (!user && !demoRole) {
      redirect("/login");
    } else {
      // Resident is strictly blocked from vendor operations
      redirect("/dashboard?error=access_restricted");
    }
  }

  // Fetch user profile from public.users table
  let profileName: string | undefined;
  let profileSocietyId: string | null = null;

  if (user) {
    try {
      const { data: profile } = await supabase
        .from("users")
        .select("name, society_id")
        .eq("id", user.id)
        .single();

      if (profile) {
        profileName = profile.name;
        profileSocietyId = profile.society_id;
      }
    } catch (err) {
      console.warn("Could not load user profile record:", err);
    }
  }

  const effectiveVendorName =
    profileName ||
    user?.user_metadata?.vendor_name ||
    user?.user_metadata?.full_name ||
    (demoRole === "vendor" ? "CoolCare Express" : userRole === "admin" ? "All Assigned Vendors" : "Authorized Vendor");

  // Fetch registered housing societies
  const { data: rawSocieties, error: societiesError } = await supabase
    .from("societies")
    .select("id, name")
    .order("name", { ascending: true });

  if (societiesError) {
    console.warn("Warning fetching societies:", societiesError.message);
  }

  const societiesList: SocietyItem[] = (rawSocieties as SocietyItem[]) || [];
  const societyMap = new Map(societiesList.map((s) => [s.id, s.name]));

  // Fetch events assigned to this vendor
  // Admins can see all vendor bookings; vendor sees bookings matching their exact vendor identity
  const buildEventsQuery = (fields: string) => {
    let q = supabase
      .from("events")
      .select(fields)
      .order("created_at", { ascending: false });

    if (userRole === "vendor") {
      const trimmedVendorName = effectiveVendorName?.trim();
      if (trimmedVendorName) {
        // Exact case-insensitive match on assigned vendor
        q = q.ilike("vendor_name", trimmedVendorName);
      }
    }
    return q;
  };

  let rawEvents: any = null;
  const fullEventsRes = await buildEventsQuery(
    "*, participants(id, user_id, flat_no, joined_at, service_status, vendor_completed_at, resident_verified_at, issue_description)"
  );

  if (fullEventsRes.error) {
    const fallbackRes = await buildEventsQuery(
      "*, participants(id, user_id, flat_no, joined_at)"
    );
    rawEvents = fallbackRes.data || [];
  } else {
    rawEvents = fullEventsRes.data || [];
  }

  // If zero events are assigned to this vendor, an empty list is passed so the UI renders the legitimate empty state.
  const eventRows = rawEvents || [];

  const initialBookings: VendorBookingItem[] = eventRows.map((row: any) => {
    const rawParts = Array.isArray(row.participants) ? row.participants : [];
    const participants: VendorFlatParticipant[] = rawParts.map((p: any) => ({
      id: p.id,
      user_id: p.user_id,
      flat_no: p.flat_no || "Flat",
      joined_at: p.joined_at,
      service_status: p.service_status || "remaining",
    }));

    // Fix 3: Strict separation between vendor operational completion and resident verification
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

    const socName = row.society_id ? societyMap.get(row.society_id) || "Palm Meadows" : "Palm Meadows";

    return {
      id: row.id,
      title: row.title,
      service_type: row.service_type || "Home Service",
      slot_time: row.slot_time,
      vendor_name: row.vendor_name || effectiveVendorName,
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

  const vendorInfo: VendorInfo = {
    id: user?.id || "demo-vendor",
    name: effectiveVendorName,
    role: userRole,
    societyName: profileSocietyId ? societyMap.get(profileSocietyId) : "Palm Meadows Housing Society",
  };

  return (
    <VendorDashboard
      initialBookings={initialBookings}
      vendorInfo={vendorInfo}
      societiesList={societiesList}
    />
  );
}
