-- ==============================================================================
-- SOCIETYPOOL SERVICE LIFECYCLE MIGRATION
-- Migration: 20261018_service_lifecycle.sql
-- Purpose: Support complete two-party service verification lifecycle:
--          1. Vendor marks assigned booking flat as 'awaiting_confirmation'
--          2. Resident independently verifies ('verified') or reports issue ('issue_reported')
-- ==============================================================================

-- 1. Add service_status column to public.participants with valid lifecycle states
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS service_status text NOT NULL DEFAULT 'remaining'
CHECK (service_status IN ('remaining', 'awaiting_confirmation', 'verified', 'issue_reported'));

-- 2. Add vendor completion metadata to public.participants
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS vendor_completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS vendor_completed_by text;

-- 3. Add resident verification and issue reporting metadata to public.participants
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS resident_verified_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS issue_description text,
ADD COLUMN IF NOT EXISTS issue_reported_at timestamp with time zone;

-- 4. Add vendor_id foreign key to public.events for strong relational vendor tenancy
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- 5. Add performance indexes for dispatch roster filtering and status queries
CREATE INDEX IF NOT EXISTS idx_participants_service_status ON public.participants(service_status);
CREATE INDEX IF NOT EXISTS idx_participants_event_status ON public.participants(event_id, service_status);
CREATE INDEX IF NOT EXISTS idx_participants_user_event ON public.participants(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_events_vendor_id ON public.events(vendor_id);
CREATE INDEX IF NOT EXISTS idx_events_vendor_name ON public.events(vendor_name);

-- 6. Add comment documentation on lifecycle state invariants
COMMENT ON COLUMN public.participants.service_status IS 
'Two-party service lifecycle state: remaining (pending service) -> awaiting_confirmation (marked complete by vendor) -> verified (confirmed by resident) OR issue_reported (flagged by resident).';
