import type { PriceTier } from "@/types";
import { format } from "date-fns";

export interface PricingResult {
  currentPrice: number;
  basePrice: number;
  originalPrice?: number;
  savingsPerResident: number;
  savingsPercentage: number;
  nextTierPrice?: number;
  nextTierNeeded?: number;
  targetCount: number;
  progressText: string;
}

interface RawPriceTier {
  minFlats?: number;
  min_flats?: number;
  maxFlats?: number | null;
  max_flats?: number | null;
  price?: number;
  discountPercentage?: number;
  discount_percentage?: number;
}

/**
 * Normalizes price_tiers JSON from Supabase into PriceTier[]
 */
export function parsePriceTiers(rawTiers: unknown): PriceTier[] {
  if (!rawTiers) return [];
  let parsed: RawPriceTier[] = [];
  if (typeof rawTiers === "string") {
    try {
      parsed = JSON.parse(rawTiers) as RawPriceTier[];
    } catch {
      return [];
    }
  } else if (Array.isArray(rawTiers)) {
    parsed = rawTiers as RawPriceTier[];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((t): t is RawPriceTier => Boolean(t && typeof t === "object"))
    .map((t) => ({
      minFlats: Math.max(1, Number(t.minFlats ?? t.min_flats ?? 1) || 1),
      maxFlats:
        t.maxFlats != null
          ? Number(t.maxFlats)
          : t.max_flats != null
          ? Number(t.max_flats)
          : null,
      price: Math.max(0, Number(t.price ?? 0) || 0),
      discountPercentage: t.discountPercentage ?? t.discount_percentage,
    }));
}

/**
 * Calculates current tier, price, next tier goal, and progress text based on participants
 */
export function calculateEventPricing(
  participantCount: number,
  tiers: PriceTier[],
  minParticipants?: number | null,
  maxParticipants?: number | null
): PricingResult {
  const safeCount = Math.max(0, Number(participantCount) || 0);

  const defaultTarget =
    maxParticipants != null && maxParticipants > 0
      ? maxParticipants
      : minParticipants != null && minParticipants > 0
      ? minParticipants
      : 20;

  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) {
    return {
      currentPrice: 399,
      basePrice: 499,
      originalPrice: 499,
      savingsPerResident: 100,
      savingsPercentage: 20,
      nextTierPrice: undefined,
      nextTierNeeded: undefined,
      targetCount: defaultTarget,
      progressText: "Join the pool to unlock society rates!",
    };
  }

  // Filter and sort tiers ascending by minFlats
  const validTiers = tiers
    .filter((t): t is PriceTier => Boolean(t && typeof t === "object" && typeof t.price === "number"))
    .map((t) => ({
      minFlats: Math.max(1, Number(t.minFlats) || 1),
      maxFlats: t.maxFlats != null ? Number(t.maxFlats) : null,
      price: Math.max(0, Number(t.price) || 0),
      discountPercentage: t.discountPercentage,
    }));

  if (validTiers.length === 0) {
    return {
      currentPrice: 399,
      basePrice: 499,
      originalPrice: 499,
      savingsPerResident: 100,
      savingsPercentage: 20,
      nextTierPrice: undefined,
      nextTierNeeded: undefined,
      targetCount: defaultTarget,
      progressText: "Join the pool to unlock society rates!",
    };
  }

  const sorted = [...validTiers].sort((a, b) => a.minFlats - b.minFlats);
  const baseTier = sorted[0];
  const highestTier = sorted[sorted.length - 1];

  // Find tier that matches current participant count
  let currentTier = sorted.find((tier) => {
    const max = tier.maxFlats ?? Infinity;
    return safeCount >= tier.minFlats && safeCount <= max;
  });

  if (!currentTier) {
    if (safeCount < baseTier.minFlats) {
      currentTier = baseTier;
    } else {
      // Participant count exceeded all tiers' maxFlats -> lock to highest tier (lowest rate)
      currentTier = highestTier;
    }
  }

  const currentPrice = currentTier.price;
  const basePrice = baseTier.price;
  const originalPrice = basePrice > currentPrice ? basePrice : undefined;

  // Next tier
  const currentIndex = sorted.indexOf(currentTier);
  const nextTier =
    currentIndex >= 0 && currentIndex < sorted.length - 1
      ? sorted[currentIndex + 1]
      : null;

  const nextTierPrice = nextTier ? nextTier.price : undefined;
  const nextTierNeeded =
    nextTier && nextTier.minFlats > safeCount
      ? nextTier.minFlats - safeCount
      : undefined;

  // Target count:
  // 1. If explicit maxParticipants is provided (> 0), use it.
  // 2. If explicit minParticipants is provided (> 0), use it as the pool target.
  // 3. Otherwise, if nextTier exists, use nextTier.minFlats.
  // 4. Otherwise, use highest tier's minFlats if > 1, or maxFlats if finite, or 20.
  let targetCount: number;
  if (maxParticipants != null && maxParticipants > 0) {
    targetCount = maxParticipants;
  } else if (minParticipants != null && minParticipants > 0) {
    targetCount = minParticipants;
  } else if (nextTier) {
    targetCount = nextTier.minFlats;
  } else if (highestTier.minFlats > 1) {
    targetCount = highestTier.minFlats;
  } else if (highestTier.maxFlats != null && highestTier.maxFlats > 0 && highestTier.maxFlats < 999) {
    targetCount = highestTier.maxFlats;
  } else {
    targetCount = 20;
  }

  const progressText =
    nextTier && nextTierNeeded
      ? `${nextTierNeeded} more needed for ₹${nextTier.price}/flat!`
      : "Maximum society discount unlocked!";

  const savingsPerResident = originalPrice && originalPrice > currentPrice ? originalPrice - currentPrice : 0;
  const savingsPercentage = originalPrice && originalPrice > 0 ? Math.round((savingsPerResident / originalPrice) * 100) : 0;

  return {
    currentPrice,
    basePrice,
    originalPrice,
    savingsPerResident,
    savingsPercentage,
    nextTierPrice,
    nextTierNeeded,
    targetCount,
    progressText,
  };
}

/**
 * Formats ISO slot time into a readable weekend or date schedule
 */
export function formatSlotTime(slotTime?: string | null): string {
  if (!slotTime) return "Slots available this weekend";
  try {
    const date = new Date(slotTime);
    if (isNaN(date.getTime())) return slotTime;
    return format(date, "EEE, d MMM h:mm a");
  } catch {
    return slotTime;
  }
}
