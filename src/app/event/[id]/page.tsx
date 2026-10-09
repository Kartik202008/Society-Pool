import { connection } from "next/server";
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

  // 2. Fetch all participants from participants table where event_id = id
  const { data: rawParticipants, error: participantsError } = await supabase
    .from("participants")
    .select("id, flat_no, user_id, joined_at")
    .eq("event_id", id);

  if (participantsError) {
    console.warn("Notice: participants fetch error:", participantsError);
  }

  const participants = rawParticipants || [];

  const event = {
    ...(rawEvent as unknown as DatabaseEventRow),
    participants,
  };

  return <EventDetailClient event={event} />;
}
