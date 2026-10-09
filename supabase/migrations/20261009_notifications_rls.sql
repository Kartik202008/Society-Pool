-- ==============================================================================
-- Migration: Add Persistent, Hardened In-App Notifications
-- Target Database: Supabase PostgreSQL (public schema)
-- File: supabase/migrations/20261009_notifications_rls.sql
-- Status: REVISED & PREPARED ONLY (DO NOT EXECUTE WITHOUT USER APPROVAL)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. COMPREHENSIVE PRE-FLIGHT SCHEMA & COMPATIBILITY CHECKS
-- ------------------------------------------------------------------------------
-- Validates prerequisite tables, columns, and foreign keys before applying changes.
-- If public.notifications already exists, verifies full schema compatibility.
-- Aborts immediately with descriptive error if any incompatibility is detected.
DO $$
DECLARE
  v_bad_cols text[];
  v_fk_delete_rule text;
  v_missing_dep text[];
BEGIN
  -- Prerequisite Check 1: Verify prerequisite tables and columns exist
  SELECT array_agg(dep.tbl || '.' || dep.col) INTO v_missing_dep
  FROM (
    VALUES 
      ('users', 'id'),
      ('users', 'role'),
      ('users', 'society_id'),
      ('events', 'id'),
      ('events', 'title'),
      ('events', 'status'),
      ('events', 'society_id'),
      ('participants', 'event_id'),
      ('participants', 'user_id'),
      ('participants', 'flat_no')
  ) AS dep(tbl, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' 
      AND c.table_name = dep.tbl 
      AND c.column_name = dep.col
  );

  IF v_missing_dep IS NOT NULL AND array_length(v_missing_dep, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite Error: Target database is missing required table columns: %', v_missing_dep;
  END IF;

  -- Prerequisite Check 2: If public.notifications already exists, verify column compatibility
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    SELECT array_agg(c.req_col || ' (' || c.req_type || ')') INTO v_bad_cols
    FROM (
      VALUES 
        ('id', 'uuid'),
        ('user_id', 'uuid'),
        ('event_id', 'uuid'),
        ('title', 'text'),
        ('message', 'text'),
        ('type', 'text'),
        ('is_read', 'boolean'),
        ('dedup_key', 'text'),
        ('created_at', 'timestamp with time zone'),
        ('updated_at', 'timestamp with time zone')
    ) AS c(req_col, req_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public' 
        AND col.table_name = 'notifications' 
        AND col.column_name = c.req_col
        AND (col.data_type = c.req_type OR col.udt_name = c.req_type)
    );

    IF v_bad_cols IS NOT NULL AND array_length(v_bad_cols, 1) > 0 THEN
      RAISE EXCEPTION 'Schema Compatibility Error: public.notifications exists with missing or mismatched columns: %', v_bad_cols;
    END IF;

    -- Prerequisite Check 3: Verify foreign key delete rule on event_id does not CASCADE
    SELECT rc.delete_rule INTO v_fk_delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc 
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' 
      AND tc.table_name = 'notifications' 
      AND kcu.column_name = 'event_id'
    LIMIT 1;

    IF v_fk_delete_rule IS NOT NULL AND v_fk_delete_rule = 'CASCADE' THEN
      RAISE EXCEPTION 'Schema Compatibility Error: public.notifications event_id foreign key uses ON DELETE CASCADE. Retention policy requires ON DELETE SET NULL to preserve resident receipts.';
    END IF;

    -- Prerequisite Check 4: If public.notifications exists, check user_id foreign key compatibility & data integrity
    DECLARE
      v_user_fk_rule text;
      v_user_ref_table text;
      v_user_ref_col text;
      v_null_user_count bigint;
      v_orphan_user_count bigint;
    BEGIN
      -- Verify existing foreign key on user_id (if present) targets public.users(id) with CASCADE
      SELECT 
        ccu.table_name,
        ccu.column_name,
        rc.delete_rule
      INTO 
        v_user_ref_table,
        v_user_ref_col,
        v_user_fk_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc 
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public' 
        AND tc.table_name = 'notifications' 
        AND kcu.column_name = 'user_id'
      LIMIT 1;

      IF v_user_ref_table IS NOT NULL THEN
        IF v_user_ref_table != 'users' OR v_user_ref_col != 'id' THEN
          RAISE EXCEPTION 'Schema Compatibility Error: public.notifications user_id foreign key references %.% instead of public.users(id).', v_user_ref_table, v_user_ref_col;
        END IF;
        IF v_user_fk_rule != 'CASCADE' THEN
          RAISE EXCEPTION 'Schema Compatibility Error: public.notifications user_id foreign key exists with delete rule "%" instead of ON DELETE CASCADE.', v_user_fk_rule;
        END IF;
      END IF;

      -- Check for NULL or orphaned user_id rows in pre-existing table
      EXECUTE 'SELECT count(*) FROM public.notifications WHERE user_id IS NULL' INTO v_null_user_count;
      IF v_null_user_count > 0 THEN
        RAISE EXCEPTION 'Schema Compatibility Error: public.notifications contains % row(s) with NULL user_id. Cannot apply NOT NULL foreign key constraint.', v_null_user_count;
      END IF;

      EXECUTE 'SELECT count(*) FROM public.notifications n WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = n.user_id)' INTO v_orphan_user_count;
      IF v_orphan_user_count > 0 THEN
        RAISE EXCEPTION 'Schema Compatibility Error: public.notifications contains % orphaned row(s) whose user_id does not exist in public.users. Cannot apply foreign key constraint.', v_orphan_user_count;
      END IF;
    END;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. TABLE DEFINITION & COLUMN CONSTRAINTS
-- ------------------------------------------------------------------------------
-- Retention & Lifecycle Policies:
-- 1. REFERENCES public.users(id) ON DELETE CASCADE cleans up notifications if a user account is deleted.
-- 2. ON DELETE SET NULL on event_id ensures resident notification history (receipts,
--    joined confirmation alerts) is preserved even if society admins delete an event.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL CHECK (type IN ('pool_joined', 'event_completed', 'event_cancelled', 'price_drop')),
  is_read boolean NOT NULL DEFAULT false,
  -- Dedup key: Deterministic token preventing duplicate notifications per user
  dedup_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotently ensure user_id foreign key exists if public.notifications was pre-existing
DO $$
DECLARE
  v_existing_fk text;
  v_ref_tbl text;
  v_ref_col text;
  v_del_rule text;
BEGIN
  SELECT 
    tc.constraint_name,
    ccu.table_name,
    ccu.column_name,
    rc.delete_rule
  INTO 
    v_existing_fk,
    v_ref_tbl,
    v_ref_col,
    v_del_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON rc.unique_constraint_name = ccu.constraint_name
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'notifications'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'user_id'
  LIMIT 1;

  IF v_existing_fk IS NOT NULL THEN
    -- Verify existing foreign key is compatible: references public.users(id) with CASCADE
    IF v_ref_tbl != 'users' OR v_ref_col != 'id' OR v_del_rule != 'CASCADE' THEN
      RAISE EXCEPTION 'Incompatible constraint: existing foreign key % references %.% (ON DELETE %) instead of users(id) ON DELETE CASCADE.',
        v_existing_fk, v_ref_tbl, v_ref_col, v_del_rule;
    END IF;
    -- Existing foreign key is already correct and compatible: proceed idempotently
  ELSE
    -- No foreign key exists on user_id: safely add it
    ALTER TABLE public.notifications 
      ADD CONSTRAINT fk_notifications_user_id 
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. CONSTRAINTS & PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
-- A. Idempotency & Deduplication: Prevents duplicate notifications per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedup 
ON public.notifications (user_id, dedup_key) 
WHERE dedup_key IS NOT NULL;

-- B. Chronological Feed Query: Optimizes user inbox retrieval ordered by date
CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
ON public.notifications (user_id, created_at DESC);

-- C. Partial Index for Unread Count: Fast lookups for header notification badge
CREATE INDEX IF NOT EXISTS idx_notifications_unread 
ON public.notifications (user_id, is_read) 
WHERE is_read = false;

-- D. Index on event_id for fast joins and event lookups
CREATE INDEX IF NOT EXISTS idx_notifications_event_id 
ON public.notifications (event_id);

-- ------------------------------------------------------------------------------
-- 4. UPDATED_AT TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_notifications_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notifications_updated_at ON public.notifications;

CREATE TRIGGER trigger_notifications_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.handle_notifications_updated_at();

-- ------------------------------------------------------------------------------
-- 5. TRANSACTIONAL DATABASE TRIGGERS FOR ATOMIC NOTIFICATION GENERATION
-- ------------------------------------------------------------------------------

-- Trigger 5A: Automatically create notification upon genuine participant insertion
CREATE OR REPLACE FUNCTION public.handle_participant_joined_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event_title text;
  v_flat_no text;
  v_dedup text;
BEGIN
  -- Read event title from verified event record
  SELECT title INTO v_event_title 
  FROM public.events 
  WHERE id = NEW.event_id;

  IF v_event_title IS NULL THEN
    v_event_title := 'Group Booking';
  END IF;

  -- Use flat_no verified directly from the inserted participant row
  v_flat_no := COALESCE(NEW.flat_no, 'Resident');
  v_dedup := 'joined_' || NEW.event_id::text || '_' || NEW.user_id::text;

  -- Insert notification idempotently
  INSERT INTO public.notifications (
    user_id,
    event_id,
    type,
    title,
    message,
    dedup_key
  )
  VALUES (
    NEW.user_id,
    NEW.event_id,
    'pool_joined',
    'Joined Group Booking',
    'You''ve joined "' || v_event_title || '" at ' || v_flat_no || '. Your spot is confirmed!',
    v_dedup
  )
  ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_participant_joined ON public.participants;

CREATE TRIGGER trigger_notify_participant_joined
AFTER INSERT ON public.participants
FOR EACH ROW
EXECUTE FUNCTION public.handle_participant_joined_notification();


-- Trigger 5B: Automatically create notifications upon verified event status transitions
CREATE OR REPLACE FUNCTION public.handle_event_status_changed_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_pt RECORD;
  v_type text;
  v_title text;
  v_msg text;
  v_dedup text;
BEGIN
  -- Strict Society Scope Verification:
  -- Do not dispatch status notifications for legacy or unassigned events whose society_id is NULL.
  -- This preserves strict society authorization consistency with notify_event_status_change().
  IF NEW.society_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only execute on transitions to 'completed' or 'cancelled'
  IF NEW.status = 'completed' THEN
    v_type := 'event_completed';
    v_title := 'Booking Completed';
    v_msg := '"' || NEW.title || '" has completed! Wholesale group discount locked and verified.';
  ELSIF NEW.status = 'cancelled' THEN
    v_type := 'event_cancelled';
    v_title := 'Booking Cancelled';
    v_msg := '"' || NEW.title || '" was cancelled by society administration. No fees were charged.';
  ELSE
    RETURN NEW;
  END IF;

  -- Loop strictly through real participants who joined this specific event
  FOR v_pt IN 
    SELECT DISTINCT user_id FROM public.participants 
    WHERE event_id = NEW.id AND user_id IS NOT NULL
  LOOP
    v_dedup := NEW.status || '_' || NEW.id::text || '_' || v_pt.user_id::text;

    INSERT INTO public.notifications (
      user_id,
      event_id,
      type,
      title,
      message,
      dedup_key
    )
    VALUES (
      v_pt.user_id,
      NEW.id,
      v_type,
      v_title,
      v_msg,
      v_dedup
    )
    ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_event_status_changed ON public.events;

CREATE TRIGGER trigger_notify_event_status_changed
AFTER UPDATE OF status ON public.events
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status 
  AND NEW.status IN ('completed', 'cancelled')
  AND NEW.society_id IS NOT NULL
)
EXECUTE FUNCTION public.handle_event_status_changed_notification();

-- ------------------------------------------------------------------------------
-- 6. TRUSTED RPC FUNCTIONS (SECURITY DEFINER WITH SEARCH PATH & STRICT CHECKS)
-- ------------------------------------------------------------------------------

-- Function 6A: Manual/Client Fallback for Booking Join Notification
-- Verification:
-- 1. Sets safe, fixed search_path.
-- 2. Reads flat number strictly from verified public.participants row, ignoring caller parameters.
-- 3. Idempotently returns notification ID without duplicate inserts.
CREATE OR REPLACE FUNCTION public.notify_booking_joined(
  p_event_id uuid,
  p_flat_no text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_event_title text;
  v_verified_flat text;
  v_notification_id uuid;
  v_dedup text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Verify caller exists in public.participants and extract verified flat_no
  SELECT flat_no INTO v_verified_flat
  FROM public.participants 
  WHERE event_id = p_event_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot create notification: caller is not a verified participant in event %', p_event_id;
  END IF;

  SELECT title INTO v_event_title FROM public.events WHERE id = p_event_id;
  IF v_event_title IS NULL THEN
    v_event_title := 'Group Booking';
  END IF;

  v_dedup := 'joined_' || p_event_id::text || '_' || v_user_id::text;

  -- Insert notification idempotently
  INSERT INTO public.notifications (
    user_id,
    event_id,
    type,
    title,
    message,
    dedup_key
  )
  VALUES (
    v_user_id,
    p_event_id,
    'pool_joined',
    'Joined Group Booking',
    'You''ve joined "' || v_event_title || '" at ' || COALESCE(v_verified_flat, 'Resident') || '. Your spot is confirmed!',
    v_dedup
  )
  ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL 
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Function 6B: Status Change Notification RPC
-- Strict Verification Rules:
-- 1. Admin Role: Verifies caller has role = 'admin' in public.users.
-- 2. Strict Society Authorization:
--    Reject authorization if the admin's society OR event's society is NULL,
--    or if they do not match.
-- 3. Actual Status Match: Event database status MUST already match requested status (no premature dispatch).
-- 4. Accurate Row Count: Accurately tallies and returns newly inserted notification count.
CREATE OR REPLACE FUNCTION public.notify_event_status_change(
  p_event_id uuid,
  p_new_status text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_admin_role text;
  v_admin_society uuid;
  v_event_status text;
  v_event_title text;
  v_event_society uuid;
  v_pt RECORD;
  v_inserted_count integer := 0;
  v_type text;
  v_title text;
  v_msg text;
  v_dedup text;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Verify admin status and society assignment from public.users
  SELECT role, society_id INTO v_admin_role, v_admin_society
  FROM public.users 
  WHERE id = v_admin_id;

  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Forbidden: Only authorized Society Admins can trigger event status notifications.';
  END IF;

  -- Validate requested status value
  IF p_new_status IS NULL
   OR p_new_status NOT IN ('completed', 'cancelled') THEN
  RAISE EXCEPTION 'Invalid status for notification dispatch: %', p_new_status;
END IF;

  -- Fetch event metadata, society, and actual database status
  SELECT status, title, society_id 
  INTO v_event_status, v_event_title, v_event_society
  FROM public.events 
  WHERE id = p_event_id;

  IF v_event_title IS NULL THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;

  -- Strict Society Scope Verification:
  -- Reject authorization if the admin's society OR event's society is NULL, or if they do not match.
  IF v_admin_society IS NULL THEN
    RAISE EXCEPTION 'Forbidden: Admin is not assigned to any society.';
  END IF;

  IF v_event_society IS NULL THEN
    RAISE EXCEPTION 'Forbidden: Event % is not assigned to any society.', p_event_id;
  END IF;

  IF v_admin_society != v_event_society THEN
    RAISE EXCEPTION 'Forbidden: Admin (society: %) is not authorized for event % (society: %).', 
      v_admin_society, p_event_id, v_event_society;
  END IF;

  -- Actual database status check
  IF v_event_status != p_new_status THEN
    RAISE EXCEPTION 'Event status mismatch: actual database status is "%", cannot dispatch notifications for "%".', v_event_status, p_new_status;
  END IF;

  IF p_new_status = 'completed' THEN
    v_type := 'event_completed';
    v_title := 'Booking Completed';
    v_msg := '"' || v_event_title || '" has completed! Wholesale group discount locked and verified.';
  ELSE
    v_type := 'event_cancelled';
    v_title := 'Booking Cancelled';
    v_msg := '"' || v_event_title || '" was cancelled by society administration. No fees were charged.';
  END IF;

  -- Loop strictly through real participants who joined this event
  FOR v_pt IN 
    SELECT DISTINCT user_id FROM public.participants 
    WHERE event_id = p_event_id AND user_id IS NOT NULL
  LOOP
    v_dedup := p_new_status || '_' || p_event_id::text || '_' || v_pt.user_id::text;

    INSERT INTO public.notifications (
      user_id,
      event_id,
      type,
      title,
      message,
      dedup_key
    )
    VALUES (
      v_pt.user_id,
      p_event_id,
      v_type,
      v_title,
      v_msg,
      v_dedup
    )
    ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;

    -- Accurately tally actual newly inserted rows
    IF FOUND THEN
      v_inserted_count := v_inserted_count + 1;
    END IF;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;

-- Function 6C: Secure Mark Notifications as Read RPC
-- Verification:
-- 1. Updates is_read exclusively for auth.uid().
-- 2. Prevents modifying any other column.
-- 3. Accurately reports count of modified rows.
CREATE OR REPLACE FUNCTION public.mark_notifications_as_read(
  p_notification_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_updated integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_notification_ids IS NULL OR array_length(p_notification_ids, 1) IS NULL THEN
    -- Mark all unread notifications for this user
    UPDATE public.notifications
    SET is_read = true, updated_at = now()
    WHERE user_id = v_user_id AND is_read = false;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  ELSE
    -- Mark specific notifications for this user
    UPDATE public.notifications
    SET is_read = true, updated_at = now()
    WHERE user_id = v_user_id AND id = ANY(p_notification_ids) AND is_read = false;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  RETURN v_updated;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Idempotently reset existing notification policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Disallow direct insert" ON public.notifications;
DROP POLICY IF EXISTS "Disallow direct update" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;

-- Policy 1: SELECT (Strict Tenant Read Isolation)
-- Guarantees a resident can ONLY view notifications where user_id matches auth.uid()
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy 2: INSERT (Strict Block on Client Insertion)
-- Unconditionally blocks direct client REST/SDK inserts. Notifications are generated
-- exclusively through trusted triggers and SECURITY DEFINER RPCs.
CREATE POLICY "Disallow direct insert"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Policy 3: UPDATE (Strict Block on Client Direct Updates)
-- Replaces ineffective WITH CHECK subquery immutability patterns by blocking direct
-- client table updates entirely. Read state modification is channeled exclusively
-- through the vetted mark_notifications_as_read() RPC.
CREATE POLICY "Disallow direct update"
ON public.notifications
FOR UPDATE
TO authenticated
USING (false);

-- Policy 4: DELETE (Dismissal Isolation)
-- Guarantees a resident can ONLY delete or dismiss their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 8. PERMISSIONS & ROLE GRANTS (PRINCIPLE OF LEAST PRIVILEGE)
-- ------------------------------------------------------------------------------
-- 8A. Table Privileges:
-- Explicitly revoke all privileges from anon and PUBLIC
REVOKE ALL ON public.notifications FROM PUBLIC, anon;

-- Grant authenticated users SELECT and DELETE only (no INSERT or UPDATE)
GRANT SELECT, DELETE ON public.notifications TO authenticated;

-- 8B. Trigger Function Privileges:
-- Revoke execution from PUBLIC and anon on internal trigger functions
REVOKE ALL ON FUNCTION public.handle_notifications_updated_at() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_participant_joined_notification() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_event_status_changed_notification() FROM PUBLIC, anon;

-- 8C. RPC Function Privileges:
-- Revoke execution from PUBLIC and anon before granting to authenticated
REVOKE ALL ON FUNCTION public.notify_booking_joined(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_event_status_change(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_notifications_as_read(uuid[]) FROM PUBLIC, anon;

-- Grant execution of trusted RPC functions to authenticated users
GRANT EXECUTE ON FUNCTION public.notify_booking_joined(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_event_status_change(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notifications_as_read(uuid[]) TO authenticated;
