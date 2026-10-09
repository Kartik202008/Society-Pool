"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogOut, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { NotificationCenter } from "@/components/dashboard/notification-center";
import { toast } from "sonner";

interface HeaderActionsProps {
  userName: string;
  avatarUrl?: string;
  societyName: string;
  flatNumber: string;
  userRole?: string;
}

export function HeaderActions({
  userName,
  avatarUrl,
  societyName,
  flatNumber,
  userRole = "resident",
}: HeaderActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  React.useEffect(() => {
    if (searchParams.get("error") === "access_restricted") {
      toast.error("Access Restricted: Administrator role required.");
    }
  }, [searchParams]);

  const handleAvatarClick = () => {
    toast(`Logged in as ${userName}`, {
      description: `${societyName} • Flat ${flatNumber} • Role: ${userRole.toUpperCase()}`,
    });
  };

  const handleSignOut = async () => {
    document.cookie = "demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0";
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    window.location.href = "/login";
  };

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleAdminClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    if (userRole !== "admin") {
      toast.error("Access restricted: Administrator role required.");
      return;
    }

    document.cookie = "demo_role=admin; path=/; max-age=86400; SameSite=Lax";
    window.location.href = "/admin";
  };

  return (
    <div className="flex items-center gap-2">
      {userRole === "admin" && (
        <Link
          href="/admin"
          onClick={handleAdminClick}
          title="Switch to Greenwood Admin Panel"
          className="relative z-10 h-8 rounded-xl border border-[#D9C9B2] bg-[#E8E3D6]/60 hover:bg-[#E8E3D6] text-[#2E3A2F] text-xs font-semibold px-2.5 inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs select-none"
        >
          <Shield className="size-3.5 text-[#C96F4F] pointer-events-none" />
          <span className="pointer-events-none">Admin</span>
        </Link>
      )}

      <Link
        href="/copilot"
        title="Ask Society Copilot"
        className="relative size-8 rounded-full border border-[#D9C9B2] bg-white text-[#C96F4F] hover:bg-[#E8E3D6]/50 hover:text-[#B85A3A] transition-all shadow-xs cursor-pointer inline-flex items-center justify-center"
        aria-label="Open AI Society Copilot"
      >
        <Sparkles className="size-4" />
      </Link>

      <NotificationCenter />

      <button
        onClick={handleAvatarClick}
        className="rounded-full ring-2 ring-[#D9C9B2]/60 hover:ring-[#6B7F5B] transition-all focus:outline-none focus:ring-2 focus:ring-[#C96F4F]"
        aria-label="Profile settings"
      >
        <Avatar size="default" className="border border-[#D9C9B2] bg-[#E8E3D6]">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
          <AvatarFallback className="bg-[#2E3A2F] text-[#F8F6EE] font-semibold text-xs">
            {initials || "RH"}
          </AvatarFallback>
        </Avatar>
      </button>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleSignOut}
        className="size-8 rounded-full text-[#2E3A2F]/70 hover:text-[#C96F4F] hover:bg-[#E8E3D6]/60 transition-all cursor-pointer"
        title="Sign Out"
        aria-label="Sign out"
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
