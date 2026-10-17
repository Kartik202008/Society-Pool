"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Layers, Sparkles, User } from "lucide-react";

export function BottomNav() {
  const pathname = usePathname();

  // If on login or signup page, don't show the bottom nav
  if (pathname === "/login" || pathname === "/signup") {
    return null;
  }

  const isAdmin = pathname.startsWith("/admin");
  const isVendor = pathname.startsWith("/vendor");

  const navItems = [
    {
      label: "Home",
      href: isVendor ? "/vendor" : isAdmin ? "/admin" : "/dashboard",
      icon: Home,
      isActive: pathname === "/dashboard" || pathname === "/admin" || pathname === "/vendor",
    },
    {
      label: "Activity",
      href: "/activity",
      icon: Layers,
      isActive: pathname === "/activity",
    },
    {
      label: "Copilot",
      href: "/copilot",
      icon: Sparkles,
      isActive: pathname.startsWith("/copilot"),
      highlight: true,
    },
    {
      label: "Profile",
      href: "/profile",
      icon: User,
      isActive: pathname === "/profile",
    },
  ];

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#F8F6EE]/95 backdrop-blur-md border-t border-[#D9C9B2]/80 shadow-lg px-4 py-2 safe-area-pb"
    >
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
                active
                  ? "text-[#C96F4F] font-semibold"
                  : "text-[#2E3A2F]/60 hover:text-[#2E3A2F]"
              }`}
            >
              <div
                className={`relative flex items-center justify-center p-1 rounded-lg transition-transform ${
                  item.highlight && active
                    ? "bg-[#C96F4F]/15 text-[#C96F4F]"
                    : item.highlight
                    ? "text-[#C96F4F]"
                    : ""
                }`}
              >
                <Icon className={`size-5 ${active ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
                {item.highlight && (
                  <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-[#C96F4F]" />
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
