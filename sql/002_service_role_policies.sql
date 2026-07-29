-- ============================================================================
-- Explicit service_role access policies
-- ============================================================================
-- Run this after 000_schema.sql (and 001_gamification.sql). On this project,
-- the service_role key isn't getting automatic RLS bypass through PostgREST
-- for reasons not fully diagnosable from outside the dashboard (confirmed:
-- the JWT's `role` claim genuinely is "service_role", so it isn't a wrong-key
-- issue — writes were still rejected with 42501 "row violates row-level
-- security policy"). Rather than depend on that implicit mechanism, this
-- grants service_role explicit full access via a policy on every table —
-- correct and robust regardless of the underlying cause, and this is a
-- completely standard pattern for Supabase backends.
-- ============================================================================

do $$
declare
    t text;
begin
    for t in
        select unnest(array[
            'meal_logs','recipes','food_items','grocery_lists',
            'workout_logs','workout_plans','workout_templates','step_logs','exercises',
            'sleep_logs','water_logs','weight_logs','supplement_logs','user_supplements','body_progress',
            'achievements','missions','challenges','automations',
            'coach_plans','chat_messages',
            'user_profiles','feature_flags','user_feature_overrides','testimonials','programs',
            'admin_notes','admin_tasks',
            'automation_runs','daily_xp_sync'
        ])
    loop
        execute format(
            'drop policy if exists service_role_full_access on public.%I;', t
        );
        execute format(
            'create policy service_role_full_access on public.%I for all to service_role using (true) with check (true);', t
        );
    end loop;
end $$;
