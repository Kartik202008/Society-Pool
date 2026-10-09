/**
 * Core domain types for SocietyPool
 * Group-buying application for home services in housing societies
 */

export interface PriceTier {
  id?: string;
  minFlats: number;
  maxFlats: number | null; // null indicates open-ended upper limit (e.g. 50+ flats)
  price: number;
  discountPercentage?: number;
}

export interface Society {
  id: string;
  name: string;
  address: string;
  city: string;
  state?: string;
  pincode: string;
  totalFlats?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type UserRole = "resident" | "admin" | "vendor";

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  societyId?: string;
  society?: Society;
  flatNumber?: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type EventStatus =
  | "upcoming"
  | "active"
  | "locked"
  | "completed"
  | "cancelled";

export type ServiceCategory =
  | "deep_cleaning"
  | "pest_control"
  | "ac_service"
  | "painting"
  | "sofa_cleaning"
  | "water_purifier"
  | "plumbing"
  | "electrical"
  | "car_wash"
  | "other";

export interface Event {
  id: string;
  title: string;
  description?: string;
  serviceCategory?: ServiceCategory | string;
  societyId?: string;
  society?: Society;
  vendorId?: string;
  vendorName?: string | null;
  status: EventStatus | string;
  startDate?: string;
  endDate?: string;
  slotTime?: string | null;
  targetFlats: number;
  currentParticipants: number;
  basePrice: number;
  currentPrice: number;
  priceTiers: PriceTier[];
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DatabaseEventRow {
  id: string;
  service_type: string;
  title: string;
  slot_time?: string | null;
  vendor_name?: string | null;
  min_participants?: number;
  max_participants?: number | null;
  price_tiers: PriceTier[] | unknown;
  status: string;
  created_by?: string | null;
  society_id?: string | null;
  created_at: string;
  participants?: { id: string }[] | null;
}

export type ParticipantStatus =
  | "joined"
  | "confirmed"
  | "completed"
  | "cancelled";

export interface Participant {
  id: string;
  eventId: string;
  event?: Event;
  userId: string;
  user?: User;
  flatNumber: string;
  status: ParticipantStatus;
  lockedPrice?: number;
  notes?: string;
  joinedAt: string;
  updatedAt?: string;
}

export interface ServiceRequest {
  id: string;
  resident_name: string;
  flat_no: string;
  service_name: string;
  description?: string | null;
  status: "pending" | "approved" | "rejected" | string;
  created_at: string;
}

export type NotificationType =
  | "pool_joined"
  | "event_completed"
  | "event_cancelled"
  | "price_drop";

export interface AppNotification {
  id: string;
  user_id: string;
  event_id?: string | null;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  dedup_key?: string | null;
  created_at: string;
}

