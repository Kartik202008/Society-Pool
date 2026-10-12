"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
}

/**
 * Animated Splash Screen for SocietyPool.
 * 
 * Sequence:
 * Step 1: Plain splash screen in exact SocietyPool theme (#F8F6EE).
 * Step 2: Flats/buildings enter from the top edge and settle in center.
 * Step 3: Pause centered for ~1.4s.
 * Step 4: Buildings exit downward through the bottom edge.
 * Step 5: Invokes onComplete() so login/signup appears with a subtle fade-in.
 */
export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isFinished, setIsFinished] = React.useState(false);

  React.useEffect(() => {
    // Respect reduced-motion accessibility settings
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mediaQuery.matches) {
        onComplete();
        return;
      }
    }

    // Timer matches total sequence (2800ms sequence + 50ms buffer)
    const timer = setTimeout(() => {
      setIsFinished(true);
      onComplete();
    }, 2850);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (isFinished) {
    return null;
  }

  return (
    <div
      aria-label="SocietyPool loading splash screen"
      role="status"
      onClick={() => {
        setIsFinished(true);
        onComplete();
      }}
      className="fixed inset-0 z-50 bg-[#F8F6EE] text-[#2E3A2F] flex flex-col items-center justify-center overflow-hidden select-none animate-splash-screen cursor-pointer"
      title="Click anywhere to skip"
    >
      {/* Top ambient earthy accent gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1.5 w-full gradient-earthy z-10" />

      {/* Buildings Illustration Container (Enters from top -> pauses -> exits bottom) */}
      <div className="flex flex-col items-center justify-center animate-splash-buildings px-4">
        {/* Housing Society Flats & Apartments Vector Illustration */}
        <div className="relative">
          <svg
            viewBox="0 0 360 250"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-72 sm:w-84 md:w-96 h-auto drop-shadow-sm pointer-events-none"
            aria-label="Housing society flats illustration"
          >
            {/* Soft Ambient Backdrop Glow */}
            <circle cx="180" cy="130" r="110" fill="#E8E3D6" fillOpacity="0.45" />

            {/* Foundation / Landscaped Groundline */}
            <rect x="20" y="218" width="320" height="6" rx="3" fill="#D9C9B2" />
            <rect x="50" y="222" width="260" height="2" rx="1" fill="#C9B89E" />

            {/* ============================================================ */}
            {/* TOWER A — Left Residential Flats Wing                         */}
            {/* ============================================================ */}
            <rect x="42" y="88" width="76" height="130" rx="4" fill="#354437" />
            {/* Tower A Rooftop Terracotta Accent Trim */}
            <rect x="42" y="80" width="76" height="8" rx="2" fill="#C96F4F" />
            <rect x="48" y="74" width="24" height="6" rx="1" fill="#2E3A2F" />

            {/* Tower A Windows & Balconies (4 Floors) */}
            {/* Floor 4 */}
            <rect x="52" y="96" width="22" height="15" rx="2" fill="#F8F6EE" />
            <rect x="84" y="96" width="22" height="15" rx="2" fill="#FAF8F0" />
            <line x1="50" y1="113" x2="76" y2="113" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />
            <line x1="82" y1="113" x2="108" y2="113" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />

            {/* Floor 3 */}
            <rect x="52" y="124" width="22" height="15" rx="2" fill="#FAF8F0" />
            <rect x="84" y="124" width="22" height="15" rx="2" fill="#F8F6EE" />
            <line x1="50" y1="141" x2="76" y2="141" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />
            <line x1="82" y1="141" x2="108" y2="141" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />

            {/* Floor 2 */}
            <rect x="52" y="152" width="22" height="15" rx="2" fill="#F8F6EE" />
            <rect x="84" y="152" width="22" height="15" rx="2" fill="#FAF8F0" />
            <line x1="50" y1="169" x2="76" y2="169" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />
            <line x1="82" y1="169" x2="108" y2="169" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />

            {/* Floor 1 */}
            <rect x="52" y="180" width="22" height="15" rx="2" fill="#FAF8F0" />
            <rect x="84" y="180" width="22" height="15" rx="2" fill="#F8F6EE" />
            <line x1="50" y1="197" x2="76" y2="197" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />
            <line x1="82" y1="197" x2="108" y2="197" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />

            {/* ============================================================ */}
            {/* TOWER B — Center High-Rise Residential Tower                  */}
            {/* ============================================================ */}
            <rect x="126" y="42" width="108" height="176" rx="5" fill="#242F25" />
            {/* Tower B Rooftop Crown & Terracotta Accent Spine */}
            <rect x="142" y="28" width="76" height="14" rx="2" fill="#C96F4F" />
            <rect x="177" y="14" width="6" height="14" rx="1" fill="#C96F4F" />
            {/* Central Architectural Glass Spine */}
            <rect x="174" y="42" width="12" height="176" fill="#1B231C" />

            {/* Left Flat Units (6 Floors) */}
            {/* Floor 6 */}
            <rect x="136" y="52" width="28" height="15" rx="2" fill="#FAF8F0" />
            <rect x="134" y="69" width="32" height="2.5" rx="1" fill="#C96F4F" />

            {/* Floor 5 */}
            <rect x="136" y="78" width="28" height="15" rx="2" fill="#F8F6EE" />
            <rect x="134" y="95" width="32" height="2.5" rx="1" fill="#C96F4F" />

            {/* Floor 4 */}
            <rect x="136" y="104" width="28" height="15" rx="2" fill="#FAF8F0" />
            <rect x="134" y="121" width="32" height="2.5" rx="1" fill="#C96F4F" />

            {/* Floor 3 */}
            <rect x="136" y="130" width="28" height="15" rx="2" fill="#F8F6EE" />
            <rect x="134" y="147" width="32" height="2.5" rx="1" fill="#C96F4F" />

            {/* Floor 2 */}
            <rect x="136" y="156" width="28" height="15" rx="2" fill="#FAF8F0" />
            <rect x="134" y="173" width="32" height="2.5" rx="1" fill="#C96F4F" />

            {/* Right Flat Units (6 Floors) */}
            {/* Floor 6 */}
            <rect x="196" y="52" width="28" height="15" rx="2" fill="#F8F6EE" />
            <rect x="194" y="69" width="32" height="2.5" rx="1" fill="#C96F4F" />

            {/* Floor 5 */}
            <rect x="196" y="78" width="28" height="15" rx="2" fill="#FAF8F0" />
            <rect x="194" y="95" width="32" height="2.5" rx="1" fill="#C96F4F" />

            {/* Floor 4 */}
            <rect x="196" y="104" width="28" height="15" rx="2" fill="#F8F6EE" />
            <rect x="194" y="121" width="32" height="2.5" rx="1" fill="#C96F4F" />

            {/* Floor 3 */}
            <rect x="196" y="130" width="28" height="15" rx="2" fill="#FAF8F0" />
            <rect x="194" y="147" width="32" height="2.5" rx="1" fill="#C96F4F" />

            {/* Floor 2 */}
            <rect x="196" y="156" width="28" height="15" rx="2" fill="#F8F6EE" />
            <rect x="194" y="173" width="32" height="2.5" rx="1" fill="#C96F4F" />

            {/* Ground Level Society Entrance Gate Portal */}
            <path d="M160 218V194C160 188 166 184 180 184C194 184 200 188 200 194V218H160Z" fill="#D9C9B2" />
            <path d="M166 218V197C166 193 170 190 180 190C190 190 194 193 194 197V218H166Z" fill="#FAF8F0" />

            {/* ============================================================ */}
            {/* TOWER C — Right Residential Flats Wing                        */}
            {/* ============================================================ */}
            <rect x="242" y="72" width="76" height="146" rx="4" fill="#354437" />
            {/* Rooftop Pergola & Garden Accent */}
            <rect x="242" y="64" width="76" height="8" rx="2" fill="#C96F4F" />
            {/* Pergola Slats */}
            <line x1="252" y1="58" x2="252" y2="64" stroke="#C96F4F" strokeWidth="2.5" />
            <line x1="266" y1="58" x2="266" y2="64" stroke="#C96F4F" strokeWidth="2.5" />
            <line x1="280" y1="58" x2="280" y2="64" stroke="#C96F4F" strokeWidth="2.5" />
            <line x1="294" y1="58" x2="294" y2="64" stroke="#C96F4F" strokeWidth="2.5" />
            <line x1="308" y1="58" x2="308" y2="64" stroke="#C96F4F" strokeWidth="2.5" />
            <line x1="248" y1="58" x2="312" y2="58" stroke="#C96F4F" strokeWidth="2.5" />

            {/* Tower C Windows & Balconies (5 Floors) */}
            {/* Floor 5 */}
            <rect x="252" y="80" width="22" height="15" rx="2" fill="#FAF8F0" />
            <rect x="284" y="80" width="22" height="15" rx="2" fill="#F8F6EE" />
            <line x1="250" y1="97" x2="276" y2="97" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />
            <line x1="282" y1="97" x2="308" y2="97" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />

            {/* Floor 4 */}
            <rect x="252" y="108" width="22" height="15" rx="2" fill="#F8F6EE" />
            <rect x="284" y="108" width="22" height="15" rx="2" fill="#FAF8F0" />
            <line x1="250" y1="125" x2="276" y2="125" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />
            <line x1="282" y1="125" x2="308" y2="125" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />

            {/* Floor 3 */}
            <rect x="252" y="136" width="22" height="15" rx="2" fill="#FAF8F0" />
            <rect x="284" y="136" width="22" height="15" rx="2" fill="#F8F6EE" />
            <line x1="250" y1="153" x2="276" y2="153" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />
            <line x1="282" y1="153" x2="308" y2="153" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />

            {/* Floor 2 */}
            <rect x="252" y="164" width="22" height="15" rx="2" fill="#F8F6EE" />
            <rect x="284" y="164" width="22" height="15" rx="2" fill="#FAF8F0" />
            <line x1="250" y1="181" x2="276" y2="181" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />
            <line x1="282" y1="181" x2="308" y2="181" stroke="#C96F4F" strokeWidth="2" strokeLinecap="round" />

            {/* ============================================================ */}
            {/* Landscaping Trees & Foliage at Base (Sage Green #6B7F5B)      */}
            {/* ============================================================ */}
            {/* Left Trees */}
            <circle cx="34" cy="214" r="9" fill="#6B7F5B" />
            <circle cx="43" cy="212" r="7" fill="#5A6D4B" />
            <rect x="33" y="214" width="2.5" height="5" fill="#2E3A2F" />

            {/* Center-Left Tree */}
            <circle cx="118" cy="214" r="8" fill="#6B7F5B" />
            <rect x="117" y="214" width="2.5" height="5" fill="#2E3A2F" />

            {/* Center-Right Tree */}
            <circle cx="236" cy="214" r="8" fill="#6B7F5B" />
            <rect x="235" y="214" width="2.5" height="5" fill="#2E3A2F" />

            {/* Right Trees */}
            <circle cx="320" cy="214" r="9" fill="#6B7F5B" />
            <circle cx="328" cy="212" r="7" fill="#5A6D4B" />
            <rect x="319" y="214" width="2.5" height="5" fill="#2E3A2F" />
          </svg>
        </div>

        {/* Brand Tagline in exact SocietyPool typography & theme */}
        <div className="mt-3 text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-2xl font-heading font-bold tracking-tight text-[#2E3A2F]">
            <span>SocietyPool</span>
            <Sparkles className="size-5 text-[#C96F4F]" />
          </div>
          <p className="text-xs text-[#2E3A2F]/70 font-medium">
            Housing Society Community
          </p>
        </div>
      </div>
    </div>
  );
}
