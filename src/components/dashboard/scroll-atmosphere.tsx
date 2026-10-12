"use client";

import * as React from "react";

interface ScrollAtmosphereProps {
  children?: React.ReactNode;
}

/**
 * ScrollAtmosphere provides a persistent, smooth scroll-driven ambient visual sequence
 * transitioning from modern residential towers -> lush green walkways -> clubhouse & pool.
 * It is positioned fixed in the background (z-0) with a refined earthy cream overlay,
 * ensuring foreground readability of cards and buttons while persisting reliably across
 * hard refreshes, router navigation, and window resizes.
 */
export function ScrollAtmosphere({ children }: ScrollAtmosphereProps = {}) {
  // scrollProgress ranges from 0 (top of page) to 1 (bottom of page)
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const [forcedScene] = React.useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("scene");
    }
    return null;
  });

  const towersRef = React.useRef<HTMLDivElement>(null);
  const gardensRef = React.useRef<HTMLDivElement>(null);
  const poolRef = React.useRef<HTMLDivElement>(null);

  const calculateOpacities = React.useCallback(
    (progress: number, overrideScene?: string | null) => {
      const scene =
        overrideScene !== undefined
          ? overrideScene
          : typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("scene")
          : null;

      if (scene === "gardens") {
        return { s1: 0, s2: 1, s3: 0 };
      }
      if (scene === "pool") {
        return { s1: 0, s2: 0, s3: 1 };
      }
      if (scene === "towers") {
        return { s1: 1, s2: 0, s3: 0 };
      }

      // Phase 1: Residential towers (dominant at top: progress 0 -> 0.45)
      const s1 = Math.max(0, Math.min(1, 1 - progress * 2.2));

      // Phase 2: Landscaped gardens & walking paths (crossfades in mid-page: progress 0.15 -> 0.85)
      let s2 = 0;
      if (progress >= 0.15 && progress <= 0.85) {
        if (progress <= 0.50) {
          s2 = Math.min(1, Math.max(0, (progress - 0.15) / 0.35));
        } else {
          s2 = Math.min(1, Math.max(0, 1 - (progress - 0.50) / 0.35));
        }
      }

      // Phase 3: Clubhouse deck & pool (unfolds toward lower section: progress 0.50 -> 1.0)
      const s3 = Math.max(0, Math.min(1, (progress - 0.50) / 0.45));

      return { s1, s2, s3 };
    },
    []
  );

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scene = params.get("scene");

    const handleScroll = () => {
      const scrollTop =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      const maxScroll = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
      setScrollProgress(progress);

      const { s1, s2, s3 } = calculateOpacities(progress, scene);
      if (towersRef.current) towersRef.current.style.opacity = String(s1);
      if (gardensRef.current) gardensRef.current.style.opacity = String(s2);
      if (poolRef.current) poolRef.current.style.opacity = String(s3);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    
    // Evaluate initial position immediately on mount / restore after refresh
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [calculateOpacities]);

  const { s1, s2, s3 } = calculateOpacities(scrollProgress, forcedScene);

  return (
    <>
      {/* ========================================================================= */}
      {/* FIXED AMBIENT BACKGROUND SCENERY (Persistent across refresh & scrolling)  */}
      {/* ========================================================================= */}
      <div
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Layer 1: Modern Residential Apartment Towers */}
        <div
          ref={towersRef}
          id="society-scene-towers"
          className="absolute inset-0 bg-cover bg-no-repeat bg-center transition-opacity duration-300 ease-out will-change-[opacity] animate-dashboard-building"
          style={{
            backgroundImage: "url('/residential-hero.jpg')",
            backgroundPosition: "center 30%",
            opacity: s1,
          }}
        />

        {/* Layer 2: Landscaped Greenery & Stone Walking Paths */}
        <div
          ref={gardensRef}
          id="society-scene-gardens"
          className="absolute inset-0 bg-cover bg-no-repeat bg-center transition-opacity duration-300 ease-out will-change-[opacity]"
          style={{
            backgroundImage: "url('/residential-gardens.jpg')",
            backgroundPosition: "center 45%",
            opacity: s2,
          }}
        />

        {/* Layer 3: Luxury Clubhouse Deck & Swimming Pool */}
        <div
          ref={poolRef}
          id="society-scene-pool"
          className="absolute inset-0 bg-cover bg-no-repeat bg-center transition-opacity duration-300 ease-out will-change-[opacity]"
          style={{
            backgroundImage: "url('/residential-pool.jpg')",
            backgroundPosition: "center 40%",
            opacity: s3,
          }}
        />

        {/* Earthy Harmonization Gradient Overlay:
            Soft cream (#F8F6EE) tint blended with subtle forest-green (#2E3A2F)
            and warm beige (#D9C9B2) so all cards and text remain readable */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(248, 246, 238, 0.88) 0%, rgba(248, 246, 238, 0.76) 25%, rgba(248, 246, 238, 0.82) 65%, rgba(248, 246, 238, 0.94) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 20%, rgba(107, 127, 91, 0.10) 0%, rgba(217, 201, 178, 0.20) 100%)",
          }}
        />
      </div>

      {/* Optional wrapper if children are passed */}
      {children ? <div className="relative z-10">{children}</div> : null}
    </>
  );
}
