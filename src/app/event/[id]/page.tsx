import { connection } from "next/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarX2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { EventDetailClient } from "@/components/event/event-detail-client";
import type { DatabaseEventRow } from "@/types";

// Allow dynamic blocking route for event detail in Next.js 16
export const instant = false;

interface EventPageProps {
  params: Promise<{ id: string }>;
}

export default async function EventPage({ params }: EventPageProps) {
  await connection();
  const { id } = await params;
  const supabase = await createClient();

  // 1. Fetch the event details from Supabase by ID
  const { data: rawEvent, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (eventError || !rawEvent) {
    console.error("Error fetching event by id:", eventError);
    return (
      <div className="min-h-screen bg-[#F8F6EE] text-[#2E3A2F] flex flex-col justify-between p-6">
        <div className="h-1.5 w-full gradient-earthy fixed top-0 left-0 right-0 z-50" />
        <main className="flex-1 flex items-center justify-center pt-12">
          <Card className="card-earthy border-[#D9C9B2] bg-white max-w-md w-full p-8 text-center shadow-xs">
            <CardContent className="space-y-4 p-0">
              <div className="size-16 rounded-2xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#C96F4F] mx-auto">
                <CalendarX2 className="size-8 text-[#C96F4F]" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-heading font-bold text-[#2E3A2F]">
                  Group Booking Not Found
                </h1>
                <p className="text-xs sm:text-sm text-[#2E3A2F]/70">
                  This society booking pool may have been closed, deleted, or does not exist.
                </p>
              </div>
              <div className="pt-2">
                <Link href="/dashboard">
                  <Button className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold rounded-xl text-xs sm:text-sm px-4 py-2 cursor-pointer shadow-xs">
                    <ArrowLeft className="size-4 mr-1.5" />
                    Back to Resident Dashboard
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // 2. Fetch current user context to detect enrolled flat
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const demoRole = cookieStore.get("demo_role")?.value;

  let userFlatNo: string | null = null;
  if (user) {
    try {
      const { data: profile } = await supabase
        .from("users")
        .select("flat_no")
        .eq("id", user.id)
        .single();
      if (profile?.flat_no) userFlatNo = profile.flat_no;
    } catch (err) {
      console.warn("Could not load user flat_no:", err);
    }
    if (!userFlatNo && user.user_metadata?.flat_no) {
      userFlatNo = user.user_metadata.flat_no;
    }
  }

  // 3. Fetch all participants from participants table where event_id = id
  let rawParticipants = null;
  const fullQuery = await supabase
    .from("participants")
    .select(
      "id, flat_no, user_id, joined_at, service_status, issue_description, resident_verified_at, vendor_completed_at"
    )
    .eq("event_id", id);

  if (fullQuery.error) {
    const standardQuery = await supabase
      .from("participants")
      .select("id, flat_no, user_id, joined_at, service_status, issue_description")
      .eq("event_id", id);

    if (standardQuery.error) {
      const minimalQuery = await supabase
        .from("participants")
        .select("id, flat_no, user_id, joined_at")
        .eq("event_id", id);
      rawParticipants = minimalQuery.data;
    } else {
      rawParticipants = standardQuery.data;
    }
  } else {
    rawParticipants = fullQuery.data;
  }

  const participants = rawParticipants || [];

  // Find enrolled participant for the current resident session
  let enrolledParticipant: any = null;
  if (user) {
    enrolledParticipant = participants.find((p: any) => p.user_id === user.id);
    if (!enrolledParticipant && userFlatNo) {
      enrolledParticipant = participants.find(
        (p: any) =>
          (p.flat_no || "").toLowerCase().trim() === userFlatNo!.toLowerCase().trim()
      );
    }
    if (enrolledParticipant && !userFlatNo) {
      userFlatNo = enrolledParticipant.flat_no;
    }
  }

  // Fallback for demo resident or simulation mode
  if (!enrolledParticipant && (!user || demoRole === "resident")) {
    enrolledParticipant =
      participants.find((p: any) => p.service_status === "awaiting_confirmation") ||
      participants.find((p: any) =>
        ["b-234", "b-402", "flat 565", "flat 994", "flat 256", "flat 904"].includes(
          (p.flat_no || "").toLowerCase().trim()
        )
      ) ||
      participants[0] ||
      null;

    if (enrolledParticipant && !userFlatNo) {
      userFlatNo = enrolledParticipant.flat_no;
    }
  }

  const event = {
    ...(rawEvent as unknown as DatabaseEventRow),
    participants,
  };

  const currentUser = {
    id: user?.id || (demoRole === "resident" ? (enrolledParticipant?.user_id || "demo-resident") : null),
    flatNo: userFlatNo,
    role: demoRole || (user ? "resident" : null),
    participantId: enrolledParticipant?.id || null,
  };

  return <EventDetailClient event={event} currentUser={currentUser} />;
}
