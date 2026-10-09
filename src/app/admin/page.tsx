import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AdminDashboard, type AdminEventItem, type EventParticipant } from "@/components/admin/admin-dashboard";
import { createClient } from "@/lib/supabase/server";
import { parsePriceTiers, calculateEventPricing } from "@/lib/pricing";
import { getUserRole } from "@/lib/auth";
import type { DatabaseEventRow, ServiceRequest } from "@/types";

// Allow dynamic blocking route for admin data fetching in Next.js 16
export const instant = false;

export default async function AdminPage() {
  await connection();
  const supabase = await createClient();

  // Verify authentication and role server-side
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const demoRole = cookieStore.get("demo_role")?.value;

  // Single source of truth for admin authorization
  const userRole = await getUserRole(supabase, user, demoRole);

  if (userRole !== "admin") {
    if (!user && !demoRole) {
      redirect("/login");
    } else {
      // Resident user is not allowed to access /admin
      redirect("/dashboard?error=access_restricted");
    }
  }

  // Fetch all events from Supabase events table ordered by created_at descending
  const { data: rawEvents, error: eventsError } = await supabase
    .from("events")
    .select("*, participants(id, flat_no, joined_at)")
    .order("created_at", { ascending: false });

  if (eventsError) {
    console.error("Error fetching admin events on server:", eventsError);
  }

  // Fetch pending service requests from residents
  const { data: rawRequests, error: requestsError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (requestsError) {
    console.warn("Notice: service_requests fetch warning (table may need creation):", requestsError.message);
  }

  const initialRequests = (rawRequests as unknown as ServiceRequest[]) ?? [];

  const rawList =
    (rawEvents as unknown as (DatabaseEventRow & { participants?: EventParticipant[] })[]) ?? [];

  const initialEvents: AdminEventItem[] = rawList.map((row) => {
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

  return <AdminDashboard initialEvents={initialEvents} initialRequests={initialRequests} />;
}
