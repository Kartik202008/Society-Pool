import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate user from trusted server session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required to publish events." },
        { status: 401 }
      );
    }

    // 2. Fetch authenticated user profile strictly from database (public.users)
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role, society_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "admin") {
      return NextResponse.json(
        {
          error:
            "Forbidden: Only authorized Society Admins can publish official events.",
        },
        { status: 403 }
      );
    }

    // 3. Require admin to have a valid, non-NULL society assignment
    if (!profile.society_id) {
      return NextResponse.json(
        {
          error:
            "Forbidden: Admin is not assigned to any society. Please contact the system administrator.",
        },
        { status: 403 }
      );
    }

    // 4. Parse and validate event payload (ignoring client-supplied society_id or created_by)
    const body = await request.json();
    const {
      title,
      service_type,
      vendor_name,
      slot_time,
      min_participants,
      max_participants,
      price_tiers,
    } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "Event title is required." },
        { status: 400 }
      );
    }

    if (!service_type || typeof service_type !== "string" || !service_type.trim()) {
      return NextResponse.json(
        { error: "Service type is required." },
        { status: 400 }
      );
    }

    // 5. Insert event with society_id and created_by derived EXCLUSIVELY from authenticated session
    const { data: newEvent, error: insertError } = await supabase
      .from("events")
      .insert({
        title: title.trim(),
        service_type: service_type.trim(),
        vendor_name: vendor_name ? String(vendor_name).trim() : "Verified Society Partner",
        slot_time: slot_time || null,
        min_participants: Number(min_participants) || 5,
        max_participants: max_participants ? Number(max_participants) : null,
        price_tiers: Array.isArray(price_tiers) ? price_tiers : [],
        status: "open",
        created_by: user.id,
        society_id: profile.society_id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error in /api/events:", insertError.message);
      return NextResponse.json(
        { error: insertError.message || "Failed to create event" },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: newEvent }, { status: 201 });
  } catch (err: unknown) {
    console.error("Unexpected error in /api/events:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
