-- ==============================================================================
-- READ-ONLY SCHEMA INSPECTION SCRIPT FOR SUPABASE SQL EDITOR
-- Purpose: Safely inspect existing tables, columns, data types, constraints,
--          indexes, RLS policies, and triggers without making any changes.
-- Usage: Copy and paste into Supabase SQL Editor and execute.
-- ==============================================================================

-- 1. INSPECT TABLE COLUMNS & DATA TYPES FOR KEY TABLES
SELECT 
  table_name,
  column_name,
  ordinal_position,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users', 'events', 'participants', 'societies', 'notifications', 'service_requests')
ORDER BY table_name, ordinal_position;

-- 2. INSPECT PRIMARY KEYS & UNIQUE CONSTRAINTS
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('users', 'events', 'participants', 'societies', 'notifications')
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- 3. INSPECT FOREIGN KEY CONSTRAINTS & ON DELETE RULES
SELECT
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  rc.delete_rule,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('users', 'events', 'participants', 'notifications')
ORDER BY tc.table_name, kcu.column_name;

-- 4. INSPECT INDEXES ON KEY TABLES
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('users', 'events', 'participants', 'societies', 'notifications')
ORDER BY tablename, indexname;

-- 5. INSPECT ROW LEVEL SECURITY STATUS & POLICIES
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'events', 'participants', 'societies', 'notifications')
ORDER BY tablename, policyname;

-- 6. INSPECT EXISTING DATABASE TRIGGERS
SELECT
  event_object_table AS table_name,
  trigger_name,
  event_manipulation AS event,
  action_timing AS timing,
  action_statement AS statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('users', 'events', 'participants', 'notifications')
ORDER BY event_object_table, trigger_name;

-- 7. INSPECT EXISTING NOTIFICATION-RELATED FUNCTIONS (IF ANY)
SELECT
  routine_name,
  routine_type,
  security_type,
  data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('notify_booking_joined', 'notify_event_status_change', 'mark_notifications_as_read', 'handle_participant_joined_notification', 'handle_event_status_changed_notification')
ORDER BY routine_name;
