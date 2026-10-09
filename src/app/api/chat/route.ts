import { createGoogle } from "@ai-sdk/google";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { getUserRole } from "@/lib/auth";

export const maxDuration = 30;

interface EventDraft {
  service: string;
  title: string;
  vendor: string;
  participants: number;
  date: string;
  time: string;
  tiers: { minFlats: number; maxFlats: number; price: number }[];
}

function parseFallbackDraft(userPrompt: string, role: "admin" | "resident" = "admin"): { message: string; draft?: EventDraft } {
  const lower = userPrompt.toLowerCase();

  // Check if user is asking to create an event or pool
  const isCreateIntent =
    lower.includes("create") ||
    lower.includes("book") ||
    lower.includes("schedule") ||
    lower.includes("pool") ||
    lower.includes("start") ||
    lower.includes("organize") ||
    lower.includes("suggest") ||
    lower.includes("request") ||
    lower.includes("ac servicing") ||
    lower.includes("ac cleaning");

  if (isCreateIntent) {
    let service = "AC Servicing";
    let title = "AC Servicing & Gas Refill";
    let vendor = "CoolCare Urban Services";
    let basePrice = 499;
    let midPrice = 399;
    let bestPrice = 299;

    if (lower.includes("car")) {
      service = "Car Wash";
      title = "Society Monsoon Car Wash";
      vendor = "Sparkle AutoCare";
      basePrice = 399;
      midPrice = 299;
      bestPrice = 199;
    } else if (lower.includes("pest")) {
      service = "Pest Control";
      title = "Complete Pest & Termite Control";
      vendor = "PestBusters India";
      basePrice = 599;
      midPrice = 499;
      bestPrice = 349;
    } else if (lower.includes("sofa")) {
      service = "Sofa Cleaning";
      title = "Sofa & Upholstery Deep Cleaning";
      vendor = "CleanLiving Services";
      basePrice = 699;
      midPrice = 549;
      bestPrice = 399;
    } else if (lower.includes("deep") || lower.includes("clean")) {
      service = "Deep Cleaning";
      title = "Full Home Deep Cleaning";
      vendor = "Sparkle Cleaners";
      basePrice = 1499;
      midPrice = 1199;
      bestPrice = 899;
    } else if (lower.includes("paint")) {
      service = "Painting";
      title = "Wall Touch-up & Balcony Painting";
      vendor = "ColorCraft Painters";
      basePrice = 899;
      midPrice = 699;
      bestPrice = 499;
    }

    // Extract participant number (e.g., 20 flats)
    const matchFlats = userPrompt.match(/(\d+)\s*(?:flats?|units?|houses?|people|residents?)?/i);
    const participants = matchFlats && Number(matchFlats[1]) > 0 ? Number(matchFlats[1]) : 20;

    // Extract day
    let date = "Sunday";
    if (lower.includes("saturday")) date = "Saturday";
    else if (lower.includes("tomorrow")) date = "Tomorrow";
    else if (lower.includes("weekend")) date = "This Weekend";
    else if (lower.includes("sunday")) date = "Sunday";
    else if (lower.includes("monday")) date = "Monday";
    else if (lower.includes("friday")) date = "Friday";

    // Extract time
    let time = "11:00 AM";
    const timeMatch = userPrompt.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (timeMatch) {
      time = timeMatch[1].toUpperCase();
    } else if (lower.includes("morning")) {
      time = "10:00 AM";
    } else if (lower.includes("evening")) {
      time = "5:00 PM";
    }

    const draft: EventDraft = {
      service,
      title,
      vendor,
      participants,
      date,
      time,
      tiers: [
        { minFlats: 1, maxFlats: 5, price: basePrice },
        { minFlats: 6, maxFlats: 15, price: midPrice },
        { minFlats: 16, maxFlats: 999, price: bestPrice },
      ],
    };

    const actionText =
      role === "admin"
        ? "Neeche diye gaye confirmation card par review karke **Publish Event** par click karein to directly open for Palm Meadows!"
        : "Neeche diye gaye preview card par review karke **Suggest to Secretary** par click karein to submit for society approval!";

    const greeting =
      role === "admin"
        ? `Ji Secretary ji! 🙏 Maine aapke liye **${service}** group booking ka structured draft ready kar diya hai:`
        : `Namaste! 🙏 Maine **${service}** group pool ke liye structured plan तैयार kar diya hai:`;

    const message = `${greeting}

• **Target:** ${participants} flats
• **Schedule:** ${date} at ${time}
• **Vendor Partner:** ${vendor}
• **Pricing Tiers:** 1–5 flats: ₹${basePrice} • 6–15 flats: ₹${midPrice} • 16+ flats: ₹${bestPrice}

${actionText}

\`\`\`event_draft
${JSON.stringify(draft, null, 2)}
\`\`\``;

    return { message, draft };
  }

  // Check if user is asking for WhatsApp broadcast
  if (lower.includes("whatsapp") || lower.includes("broadcast") || lower.includes("message")) {
    const message = `Yahan aapka WhatsApp broadcast template ready hai:

━━━━━━━━━━━━━━━━━━━
📢 *SocietyPool Group Booking Alert!* 📢
🏢 *Palm Meadows Society*

Neighbors! We're pooling demand for *AC Servicing & Gas Refill* this Sunday at 11 AM with *CoolCare Urban Services*.

💰 *Wholesale Group Buying Rates:*
• 1–5 flats: ₹499/flat
• 6–15 flats: ₹399/flat
• 16+ flats: *₹299/flat (Best Value!)*

As more flats join, everyone pays the lowest unlocked price! 

👉 Join your society pool now:
https://societypool.vercel.app/dashboard
━━━━━━━━━━━━━━━━━━━

Aap ise directly WhatsApp society groups me share kar sakte hain! 🚀`;
    return { message };
  }

  // Check if user is asking for pricing suggestion
  if (lower.includes("price") || lower.includes("pricing") || lower.includes("tier") || lower.includes("discount")) {
    const message = `Palm Meadows ke historical demand aur vendor margins ke hisaab se recommended 3-tier pricing model:

1. **Base Tier (1–5 flats):** Standard 15% society discount (e.g. ₹499)
2. **Growth Tier (6–15 flats):** 30% volume discount (e.g. ₹399) — *Highest conversion sweet spot*
3. **Wholesale Tier (16+ flats):** 45% maximum bulk discount (e.g. ₹299) — *Locks in entire wing participation*

Kya aap is pricing ke sath pool plan karna chahte hain? Bas batayein: *"Plan event for 20 flats"*`;
    return { message };
  }

  // General fallback
  const message =
    role === "admin"
      ? `Namaste Secretary ji! 🙏 Main aapki society ke liye bulk group bookings create karne, attractive WhatsApp updates draft karne, aur volume discounts plan karne me madad kar sakta hoon.

Aap mujhse pooch sakte hain:
• *"Create AC servicing for 20 flats this Sunday at 11 AM"*
• *"Draft a WhatsApp broadcast for society car wash"*
• *"Suggest optimal pricing tiers for pest control"*`
      : `Namaste! 🙏 Main hoon aapka SocietyPool Copilot. Main Palm Meadows ke liye services discover karne, pricing compare karne, aur Secretary ji ko suggest karne me madad kar sakta hoon.

Aap mujhse pooch sakte hain:
• *"Suggest AC servicing for 20 flats this Sunday at 11 AM"*
• *"Draft a WhatsApp message to ask neighbors about sofa cleaning"*
• *"What are typical volume discount tiers for deep cleaning?"*`;

  return { message };
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate user and verify access
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const cookieStore = await cookies();
    const demoRole = cookieStore.get("demo_role")?.value;

    if (!user && !demoRole) {
      return new Response(
        JSON.stringify({ error: "Authentication required to access Society Copilot." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Determine trusted effective role
    const effectiveRole = await getUserRole(supabase, user, demoRole);

    const body = await req.json();
    const messages = body.messages || [];
    const latestUserMessage =
      messages.filter((m: { role: string }) => m.role === "user").pop()?.content || "";

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      "";

    if (!apiKey) {
      console.warn("No GEMINI_API_KEY found in environment, using intelligent fallback parser.");
      const { message } = parseFallbackDraft(latestUserMessage, effectiveRole);
      return new Response(message, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    try {
      const google = createGoogle({ apiKey });

      const roleContext =
        effectiveRole === "admin"
          ? "You are SocietyPool Copilot assisting the society secretary/admin of Palm Meadows Society. You help create and schedule official bulk group bookings, draft WhatsApp announcements, and plan volume discount tiers."
          : "You are SocietyPool Copilot assisting a resident of Palm Meadows Society. You help residents discover bulk services, understand dynamic volume pricing tiers, draft WhatsApp messages to invite neighbors, and formulate service suggestions for society management.";

      const result = streamText({
        model: google("gemini-1.5-flash"),
        system: `${roleContext}
When a user asks to plan, draft, suggest, or schedule an event/service pool (e.g. "Plan AC servicing for 20 flats this Sunday at 11 AM"):
1. Acknowledge enthusiastically and briefly in Hinglish/English.
2. ALWAYS output a structured event draft block at the end in this EXACT format:
\`\`\`event_draft
{
  "service": "AC Servicing",
  "title": "AC Servicing Group Booking",
  "vendor": "CoolCare Urban Services",
  "participants": 20,
  "date": "Sunday",
  "time": "11:00 AM",
  "tiers": [
    { "minFlats": 1, "maxFlats": 5, "price": 499 },
    { "minFlats": 6, "maxFlats": 15, "price": 399 },
    { "minFlats": 16, "maxFlats": 999, "price": 299 }
  ]
}
\`\`\`
If the user asks for a WhatsApp message, write a catchy, emoji-rich Hinglish WhatsApp message inviting flats to join.
If the user asks to suggest pricing, recommend 3 tiers based on wholesale volume. Keep responses short and friendly.`,
        messages,
      });

      return result.toTextStreamResponse();
    } catch (geminiError) {
      console.warn("Gemini stream error, falling back to smart parser:", geminiError);
      const { message } = parseFallbackDraft(latestUserMessage, effectiveRole);
      return new Response(message, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  } catch (error) {
    console.error("Chat API processing error:", error);
    return new Response(
      "Namaste! Main ready hoon. Bas batayein kaunsi service plan ya discuss karni hai.",
      {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }
    );
  }
}

