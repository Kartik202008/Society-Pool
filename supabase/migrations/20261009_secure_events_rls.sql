-- ==============================================================================
-- Migration: Secure Official Events Table with Row Level Security (RLS)
-- Description: Enforces that only authorized Society Admins can create or modify
--              official booking events, while allowing residents to view events.
-- ==============================================================================

-- 1. Ensure Row Level Security is enabled on public.events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing permissive policies if they exist
DROP POLICY IF EXISTS "Allow public read on events" ON public.events;
DROP POLICY IF EXISTS "Allow all users to insert events" ON public.events;
DROP POLICY IF EXISTS "Allow admins to insert events" ON public.events;
DROP POLICY IF EXISTS "Allow admins to update events" ON public.events;
DROP POLICY IF EXISTS "Allow admins to delete events" ON public.events;

-- 3. Policy: Public Read
-- Anyone (authenticated residents, society members) can view active and open events
CREATE POLICY "Allow public read on events"
ON public.events
FOR SELECT
TO authenticated, anon
USING (true);

-- 4. Policy: Admin Insert Only
-- Only authenticated users who possess role = 'admin' in public.users can insert official events
CREATE POLICY "Allow admins to insert events"
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
    AND public.users.role = 'admin'
  )
);

-- 5. Policy: Admin Update Only
-- Only authenticated Society Admins can edit or cancel events
CREATE POLICY "Allow admins to update events"
ON public.events
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
    AND public.users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
    AND public.users.role = 'admin'
  )
);

-- 6. Policy: Admin Delete Only
-- Only authenticated Society Admins can delete events
CREATE POLICY "Allow admins to delete events"
ON public.events
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
    AND public.users.role = 'admin'
  )
);

-- 7. Ensure service_requests allows residents to submit suggestions
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on service_requests" ON public.service_requests;
DROP POLICY IF EXISTS "Allow residents to insert service_requests" ON public.service_requests;

CREATE POLICY "Allow public read on service_requests"
ON public.service_requests
FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "Allow residents to insert service_requests"
ON public.service_requests
FOR INSERT
TO authenticated, anon
WITH CHECK (true);
