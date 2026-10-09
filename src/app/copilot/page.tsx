"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sparkles,
  Send,
  ArrowLeft,
  Check,
  Zap,
  Loader2,
  Copy,
  Calendar,
  Users,
  Building,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface EventDraft {
  service: string;
  title: string;
  vendor: string;
  participants: number;
  date: string;
  time: string;
  tiers: { minFlats: number; maxFlats: number; price: number }[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  draft?: EventDraft;
}

const QUICK_ACTIONS_ADMIN = [
  {
    label: "Create Group Booking",
    prompt: "Create AC servicing for 20 flats this Sunday at 11 AM.",
  },
  {
    label: "Generate WhatsApp Message",
    prompt: "Draft a catchy WhatsApp message to invite Palm Meadows flats to join the AC servicing pool at ₹399.",
  },
  {
    label: "Suggest Pricing",
    prompt: "Suggest optimal volume discount tiers for 20 flats society deep cleaning.",
  },
];

const QUICK_ACTIONS_RESIDENT = [
  {
    label: "Suggest a Service",
    prompt: "Suggest AC servicing for 20 flats this Sunday at 11 AM.",
  },
  {
    label: "Draft Neighbor Invite",
    prompt: "Draft a WhatsApp message to ask Palm Meadows neighbors if they want to join a sofa cleaning pool.",
  },
  {
    label: "Compare Volume Pricing",
    prompt: "What are typical volume discount tiers for 20 flats society deep cleaning?",
  },
];

function toIsoSlotTime(input: string): string {
  const d = new Date(input);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  const now = new Date();
  const lower = (input || "").toLowerCase();
  const target = new Date();

  if (lower.includes("sun")) {
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    target.setDate(now.getDate() + daysUntilSunday);
    target.setHours(11, 0, 0, 0);
  } else if (lower.includes("next weekend")) {
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
    target.setDate(now.getDate() + daysUntilSaturday + 7);
    target.setHours(10, 0, 0, 0);
  } else {
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
    target.setDate(now.getDate() + daysUntilSaturday);
    target.setHours(10, 0, 0, 0);
  }

  return target.toISOString();
}

function extractDraftFromContent(text: string): { cleanText: string; draft?: EventDraft } {
  const draftRegex = /```event_draft\s*([\s\S]*?)\s*```/;
  const match = text.match(draftRegex);

  if (!match) {
    return { cleanText: text };
  }

  try {
    const draftJson = JSON.parse(match[1]);
    const cleanText = text.replace(draftRegex, "").trim();
    return { cleanText, draft: draftJson as EventDraft };
  } catch (err) {
    console.warn("Could not parse event_draft JSON:", err);
    return { cleanText: text };
  }
}

export default function CopilotPage() {
  const [userRole, setUserRole] = React.useState<"admin" | "resident">("resident");
  const [userName, setUserName] = React.useState<string>("Rahul");
  const [userFlat, setUserFlat] = React.useState<string>("B-402");
  const [societyName, setSocietyName] = React.useState<string>("Palm Meadows");
  const [isRoleLoaded, setIsRoleLoaded] = React.useState(false);

  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "welcome-1",
      role: "assistant",
      content:
        "Namaste! 🙏 Main hoon aapka SocietyPool Copilot. Main Palm Meadows ke liye services discover karne, pricing compare karne, aur Secretary ji ko suggest karne me madad kar sakta hoon.\n\nAap kaunsi service ke baare me janna ya suggest karna chahte hain?",
      timestamp: "Just now",
    },
  ]);

  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [creatingEventId, setCreatingEventId] = React.useState<string | null>(null);
  const [createdEventIds, setCreatedEventIds] = React.useState<Record<string, string>>({});
  const [suggestingRequestId, setSuggestingRequestId] = React.useState<string | null>(null);
  const [suggestedRequestIds, setSuggestedRequestIds] = React.useState<Record<string, string>>({});

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Load user role and profile from trusted Supabase session on mount
  React.useEffect(() => {
    let isMounted = true;

    const fetchUserProfile = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const demoRoleMatch = typeof document !== "undefined" ? document.cookie.match(/demo_role=(admin|resident)/) : null;
        const demoRole = demoRoleMatch ? demoRoleMatch[1] : null;

        if (user) {
          const { data: profile } = await supabase
            .from("users")
            .select("*, societies(id, name)")
            .eq("id", user.id)
            .single();

          const role = profile?.role || user.user_metadata?.role || demoRole || "resident";
          const rawName = profile?.name || user.user_metadata?.name || user.email?.split("@")[0] || "Neighbor";
          const flat = profile?.flat_no || user.user_metadata?.flat_no || "B-402";
          const society =
            (profile?.societies as unknown as { name?: string })?.name ||
            (user.user_metadata?.society_name as string) ||
            "Palm Meadows";

          if (isMounted) {
            const resolvedRole = role === "admin" ? "admin" : "resident";
            setUserRole(resolvedRole);
            setUserName(rawName);
            setUserFlat(flat);
            setSocietyName(society);
            setIsRoleLoaded(true);

            // Set role-appropriate initial welcome message if no user messages sent yet
            setMessages((prev) => {
              if (prev.length <= 1 && prev[0]?.id === "welcome-1") {
                return [
                  {
                    id: "welcome-1",
                    role: "assistant",
                    content:
                      resolvedRole === "admin"
                        ? `Namaste Secretary ji! 🙏 Main hoon aapka SocietyPool Copilot. Main ${society} ke liye bulk group bookings create karne, attractive WhatsApp updates draft karne, aur volume discounts plan karne me madad kar sakta hoon.\n\nAaj society ke liye kaunsa group booking event create karna hai?`
                        : `Namaste ${rawName.split(" ")[0]} ji! 🙏 Main hoon aapka SocietyPool Copilot. Main ${society} ke liye group buying services discover karne, wholesale pricing compare karne, aur Secretary ji ko suggest karne me madad kar sakta hoon.\n\nAap kaunsi service ke baare me janna ya suggest karna chahte hain?`,
                    timestamp: "Just now",
                  },
                ];
              }
              return prev;
            });
          }
        } else if (demoRole === "admin") {
          if (isMounted) {
            setUserRole("admin");
            setUserName("Secretary");
            setUserFlat("Sec-Office");
            setSocietyName("Palm Meadows");
            setIsRoleLoaded(true);
            setMessages([
              {
                id: "welcome-1",
                role: "assistant",
                content:
                  "Namaste Secretary ji! 🙏 Main hoon aapka SocietyPool Copilot. Main Palm Meadows ke liye bulk group bookings create karne, attractive WhatsApp updates draft karne, aur volume discounts plan karne me madad kar sakta hoon.\n\nAaj society ke liye kaunsa group booking event create karna hai?",
                timestamp: "Just now",
              },
            ]);
          }
        } else {
          if (isMounted) {
            setUserRole("resident");
            setUserName("Rahul");
            setUserFlat("B-402");
            setSocietyName("Palm Meadows");
            setIsRoleLoaded(true);
          }
        }
      } catch (err) {
        if (isMounted) setIsRoleLoaded(true);
      }
    };

    fetchUserProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ADMIN ACTION: Publish official event via secure server endpoint (/api/events)
  const handlePublishEventAsAdmin = async (messageId: string, draft: EventDraft) => {
    setCreatingEventId(messageId);
    try {
      const slotIso = toIsoSlotTime(`${draft.date} ${draft.time}`);

      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title || `${draft.service} Group Booking`,
          service_type: draft.service,
          vendor_name: draft.vendor || "Verified Society Partner",
          slot_time: slotIso,
          min_participants: Number(draft.participants) || 20,
          max_participants: null,
          price_tiers: draft.tiers,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "Failed to publish official event.");
        return;
      }

      setCreatedEventIds((prev) => ({
        ...prev,
        [messageId]: result.data.id,
      }));

      toast.success(`🎉 ${draft.service} Group Booking published successfully!`, {
        description: `Now live for ${societyName} residents to join.`,
        duration: 5000,
      });
    } catch (err: unknown) {
      console.error("Publish event error:", err);
      const e = err as { message?: string };
      toast.error(e?.message || "Failed to publish event");
    } finally {
      setCreatingEventId(null);
    }
  };

  // RESIDENT ACTION: Suggest service to society secretary via existing service_requests workflow
  const handleSuggestServiceAsResident = async (messageId: string, draft: EventDraft) => {
    setSuggestingRequestId(messageId);
    try {
      const supabase = createClient();
      const details = `Copilot Suggestion: ${draft.title || draft.service} • Target: ${draft.participants} flats • Schedule: ${draft.date} ${draft.time} • Partner: ${draft.vendor}`;

      const { data, error } = await supabase
        .from("service_requests")
        .insert({
          resident_name: userName || "Rahul Sharma",
          flat_no: userFlat || "B-402",
          service_name: draft.service,
          description: details,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Error inserting service_request from Copilot:", error);
        toast.error(error.message || "Failed to submit service suggestion");
        return;
      }

      setSuggestedRequestIds((prev) => ({
        ...prev,
        [messageId]: data.id,
      }));

      toast.success("✅ Suggestion sent to your Secretary!", {
        description: `Your request for ${draft.service} has been submitted to society management for review.`,
        duration: 5000,
      });
    } catch (err: unknown) {
      console.error("Suggest service exception:", err);
      const e = err as { message?: string };
      toast.error(e?.message || "Failed to submit service suggestion");
    } finally {
      setSuggestingRequestId(null);
    }
  };

  const sendMessage = async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || isLoading) return;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;

    const newUserMsg: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: trimmed,
      timestamp: "Just now",
    };

    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body received");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let rawStreamed = "";

      // Add placeholder assistant message
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          timestamp: "Just now",
        },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        rawStreamed += chunk;

        const { cleanText, draft } = extractDraftFromContent(rawStreamed);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: cleanText || rawStreamed, draft }
              : msg
          )
        );
      }

      const finalExtracted = extractDraftFromContent(rawStreamed);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: finalExtracted.cleanText || rawStreamed,
                draft: finalExtracted.draft,
              }
            : msg
        )
      );
    } catch (error) {
      console.warn("Copilot API stream error:", error);
      toast.error("Could not reach Copilot API, please try again.");
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="min-h-screen bg-[#F8F6EE] text-[#2E3A2F] flex flex-col justify-between selection:bg-[#C96F4F]/20 pb-20 sm:pb-16">
      {/* Top ambient earthy accent gradient bar */}
      <div className="h-1.5 w-full gradient-earthy sticky top-0 z-50" />

      {/* Header */}
      <header className="sticky top-1.5 z-40 bg-[#F8F6EE]/95 backdrop-blur-md border-b border-[#D9C9B2]/80 px-4 sm:px-6 py-3 transition-all">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href={userRole === "admin" ? "/admin" : "/dashboard"}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8 rounded-xl border border-[#D9C9B2] bg-white text-[#2E3A2F] hover:bg-[#E8E3D6] cursor-pointer"
                title={userRole === "admin" ? "Back to Admin Dashboard" : "Back to Resident Dashboard"}
              >
                <ArrowLeft className="size-4" />
              </Button>
            </Link>

            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-xl bg-[#C96F4F] text-[#F8F6EE] flex items-center justify-center shadow-xs">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-heading font-bold text-[#2E3A2F] tracking-tight">
                    Society Copilot ✨
                  </h1>
                  <Badge className="bg-[#6B7F5B] text-[#F8F6EE] text-[10px] font-semibold px-2 py-0.5 rounded-full border-none">
                    {userRole === "admin" ? "Secretary AI" : "Resident AI"}
                  </Badge>
                </div>
                <p className="text-xs text-[#2E3A2F]/70">
                  {userRole === "admin"
                    ? `Natural language event planning for ${societyName}`
                    : `Group buying discovery & suggestions for ${societyName}`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-xl border-[#D9C9B2] bg-white hover:bg-[#E8E3D6] text-[#2E3A2F] text-xs font-semibold px-2.5 hidden sm:inline-flex"
              >
                {userRole === "admin" ? "Resident View" : "Dashboard"}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Chat Thread */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-4 flex-1 pb-4">
          {messages.map((message) => {
            const isUser = message.role === "user";
            const eventDraft = message.draft;
            const createdEventId = createdEventIds[message.id];
            const isSuggested = Boolean(suggestedRequestIds[message.id]);

            return (
              <div
                key={message.id}
                className={`flex gap-2.5 sm:gap-3 ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                {!isUser && (
                  <Avatar className="size-8 rounded-xl border border-[#D9C9B2] bg-[#E8E3D6] shrink-0 mt-0.5 shadow-xs">
                    <AvatarFallback className="bg-[#C96F4F] text-[#F8F6EE] text-xs font-bold">
                      <Sparkles className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                )}

                <div
                  className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs relative group ${
                    isUser
                      ? "bg-[#2E3A2F] text-[#F8F6EE] rounded-tr-xs"
                      : "bg-white text-[#2E3A2F] border border-[#D9C9B2] rounded-tl-xs"
                  }`}
                >
                  <div className="whitespace-pre-wrap font-sans">
                    {message.content}
                  </div>

                  {/* STRUCTURED CONFIRMATION CARD (when Gemini extracts event parameters) */}
                  {eventDraft && (
                    <div className="mt-3.5 pt-3.5 border-t border-[#D9C9B2]/80 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#C96F4F] flex items-center gap-1.5 uppercase tracking-wide">
                          <Sparkles className="size-3.5 text-[#C96F4F]" />
                          Structured Event Preview
                        </span>
                        <Badge className="bg-[#6B7F5B] text-[#F8F6EE] text-[10px] font-semibold border-none">
                          {societyName}
                        </Badge>
                      </div>

                      {/* Extracted Attributes Grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-[#F8F6EE] p-3 rounded-xl border border-[#D9C9B2]/60">
                        <div>
                          <span className="text-[#2E3A2F]/60 block text-[10px] uppercase font-semibold">
                            Service
                          </span>
                          <span className="font-bold text-[#2E3A2F]">
                            {eventDraft.service}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#2E3A2F]/60 block text-[10px] uppercase font-semibold">
                            Participants
                          </span>
                          <span className="font-bold text-[#2E3A2F]">
                            {eventDraft.participants} flats
                          </span>
                        </div>
                        <div>
                          <span className="text-[#2E3A2F]/60 block text-[10px] uppercase font-semibold">
                            Schedule
                          </span>
                          <span className="font-bold text-[#2E3A2F]">
                            {eventDraft.date} • {eventDraft.time}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#2E3A2F]/60 block text-[10px] uppercase font-semibold">
                            Vendor
                          </span>
                          <span className="font-bold text-[#2E3A2F] truncate">
                            {eventDraft.vendor}
                          </span>
                        </div>
                      </div>

                      {/* Pricing Tiers Table */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-[#2E3A2F]">
                          Dynamic Volume Pricing:
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                          {eventDraft.tiers.map((tier, idx) => (
                            <div
                              key={idx}
                              className={`p-2 rounded-xl border ${
                                idx === eventDraft.tiers.length - 1
                                    ? "bg-[#6B7F5B]/15 border-[#6B7F5B] text-[#2E3A2F]"
                                  : "bg-white border-[#D9C9B2]"
                              }`}
                            >
                              <span className="block text-[10px] text-[#2E3A2F]/70">
                                {tier.minFlats}–{tier.maxFlats >= 900 ? "+" : tier.maxFlats} flats
                              </span>
                              <span className="font-bold text-sm text-[#C96F4F]">
                                ₹{tier.price}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Role-Specific Action Buttons */}
                      {userRole === "admin" ? (
                        /* ADMIN ACTION: Publish Official Event */
                        createdEventId ? (
                          <div className="pt-1.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-[#E8E3D6]/50 p-2.5 rounded-xl border border-[#D9C9B2]">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B7F5B]">
                              <CheckCircle2 className="size-4" />
                              <span>Event Published to Society!</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Link href={`/event/${createdEventId}`} className="flex-1 sm:flex-initial">
                                <Button
                                  size="sm"
                                  className="w-full bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold text-xs rounded-xl h-8 px-3 cursor-pointer"
                                >
                                  View Event Details →
                                </Button>
                              </Link>
                            </div>
                          </div>
                        ) : (
                          <Button
                            onClick={() => handlePublishEventAsAdmin(message.id, eventDraft)}
                            disabled={creatingEventId === message.id}
                            className="w-full bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold text-xs py-2 h-9 rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                          >
                            {creatingEventId === message.id ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin" />
                                Publishing to {societyName}...
                              </>
                            ) : (
                              <>
                                <Sparkles className="size-3.5" />
                                Publish Event (Admin)
                              </>
                            )}
                          </Button>
                        )
                      ) : (
                        /* RESIDENT ACTION: Suggest Service to Society Management */
                        isSuggested ? (
                          <div className="pt-1.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-[#E8E3D6]/50 p-2.5 rounded-xl border border-[#D9C9B2]">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B7F5B]">
                              <CheckCircle2 className="size-4" />
                              <span>Suggestion Sent to Secretary!</span>
                            </div>
                            <Badge className="bg-[#6B7F5B] text-[#F8F6EE] text-[10px] self-start sm:self-auto border-none">
                              Pending Review
                            </Badge>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <Button
                              onClick={() => handleSuggestServiceAsResident(message.id, eventDraft)}
                              disabled={suggestingRequestId === message.id}
                              className="w-full bg-[#6B7F5B] hover:bg-[#5b6d4d] text-[#F8F6EE] font-semibold text-xs py-2 h-9 rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                            >
                              {suggestingRequestId === message.id ? (
                                <>
                                  <Loader2 className="size-3.5 animate-spin" />
                                  Submitting to Secretary...
                                </>
                              ) : (
                                <>
                                  <Send className="size-3.5" />
                                  Suggest to Secretary
                                </>
                              )}
                            </Button>
                            <p className="text-[11px] text-center text-[#2E3A2F]/65 font-medium">
                              Only Society Admins can publish official events. Your suggestion will be reviewed by management.
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Copy helper on AI messages */}
                  {!isUser && message.content && (
                    <div className="mt-2 pt-2 border-t border-[#E8E3D6] flex items-center justify-between text-[11px] text-[#2E3A2F]/60">
                      <span>SocietyPool AI</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(message.id, message.content)}
                        className="hover:text-[#C96F4F] flex items-center gap-1 cursor-pointer transition-colors"
                        title="Copy message"
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check className="size-3 text-[#6B7F5B]" />
                            <span className="text-[#6B7F5B]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {message.timestamp && (
                    <span
                      className={`block text-[10px] mt-1 text-right ${
                        isUser ? "text-[#F8F6EE]/60" : "text-[#2E3A2F]/40"
                      }`}
                    >
                      {message.timestamp}
                    </span>
                  )}
                </div>

                {isUser && (
                  <Avatar className="size-8 rounded-xl border border-[#D9C9B2] bg-[#2E3A2F] shrink-0 mt-0.5 shadow-xs">
                    <AvatarFallback className="bg-[#2E3A2F] text-[#F8F6EE] text-xs font-bold">
                      {userRole === "admin" ? "Sec" : userFlat.replace("Flat ", "").slice(0, 4)}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}

          {/* Typing Indicator / Loading State */}
          {isLoading && (
            <div className="flex gap-2.5 sm:gap-3 justify-start">
              <Avatar className="size-8 rounded-xl border border-[#D9C9B2] bg-[#E8E3D6] shrink-0 mt-0.5 shadow-xs">
                <AvatarFallback className="bg-[#C96F4F] text-[#F8F6EE] text-xs font-bold">
                  <Sparkles className="size-4 animate-spin" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-white border border-[#D9C9B2] rounded-2xl rounded-tl-xs px-4 py-3 shadow-xs flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#C96F4F] animate-bounce [animation-delay:-0.3s]" />
                <span className="size-2 rounded-full bg-[#6B7F5B] animate-bounce [animation-delay:-0.15s]" />
                <span className="size-2 rounded-full bg-[#2E3A2F] animate-bounce" />
                <span className="text-xs text-[#2E3A2F]/60 ml-2 font-medium">
                  Copilot formulating details...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input bar and Quick actions */}
      <div className="sticky bottom-16 sm:bottom-14 z-30 bg-[#F8F6EE]/95 backdrop-blur-md border-t border-[#D9C9B2]/70 px-4 sm:px-6 pt-3 pb-3">
        <div className="max-w-3xl mx-auto space-y-2.5">
          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-[11px] font-semibold text-[#2E3A2F]/60 shrink-0 flex items-center gap-1 mr-1">
              <Zap className="size-3 text-[#C96F4F]" />
              Quick:
            </span>
            {(userRole === "admin" ? QUICK_ACTIONS_ADMIN : QUICK_ACTIONS_RESIDENT).map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => sendMessage(action.prompt)}
                disabled={isLoading}
                className="text-xs px-3 py-1.5 rounded-full border border-[#D9C9B2] bg-white text-[#2E3A2F] hover:bg-[#E8E3D6] hover:border-[#6B7F5B] transition-all whitespace-nowrap cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              >
                ✨ {action.label}
              </button>
            ))}
          </div>

          {/* Chat Form */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                userRole === "admin"
                  ? "e.g. Create AC servicing for 20 flats this Sunday at 11 AM"
                  : "e.g. Can we organize AC servicing for our society this Sunday?"
              }
              disabled={isLoading}
              className="flex-1 bg-white border-[#D9C9B2] focus-visible:border-[#6B7F5B] focus-visible:ring-[#6B7F5B]/30 text-sm text-[#2E3A2F] rounded-xl h-11 px-3.5 shadow-xs"
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-[#C96F4F] hover:bg-[#B85A3A] text-[#F8F6EE] font-semibold h-11 px-4 sm:px-5 rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <Send className="size-4" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
