-- ============================================================================
-- FitQuest backend — gamification support migration
-- ============================================================================
-- Run this in the Supabase SQL Editor (or via your own migration tooling)
-- against the SAME project SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY the backend
-- is configured with. Nothing in this repo can run it for you — the backend
-- only ever calls these functions, it never creates them.
--
-- ASSUMPTIONS — verify these against your actual schema before running, and
-- adjust the syntax below if any of them are wrong for your project:
--   1. user_profiles.user_email      text, unique per user
--   2. user_profiles.last_login_date date            (not text/timestamptz)
--   3. user_profiles.mission_xp_date date             (used by the frontend
--                                                       watermark, not by this
--                                                       migration directly)
--   4. user_profiles.achievements    text[]           (not jsonb)
--   5. user_profiles.login_streak / longest_streak / total_xp   integer
--   6. automations.id                uuid
-- If your columns differ (e.g. achievements is jsonb, or ids are bigint),
-- adjust the affected statements — they're marked below.
-- ============================================================================

-- ── automation_runs ──────────────────────────────────────────────────────────
-- Dedupe table for automationService.runAutomationsForUser: a row here is
-- INSERTed to atomically "claim" a rule for a user on a given day BEFORE the
-- rule's action executes, so two concurrent requests can't both fire it.
create table if not exists public.automation_runs (
    id          bigint generated always as identity primary key,
    rule_id     uuid not null references public.automations(id) on delete cascade, -- adjust type if automations.id isn't uuid
    user_email  text not null,
    run_date    date not null,
    created_at  timestamptz not null default now(),
    unique (rule_id, user_email, run_date)
);

-- ── daily_xp_sync ─────────────────────────────────────────────────────────────
-- Tracks how much mission/bonus XP has already been synced for a user on a
-- given day, so sync_daily_xp only ever awards the incremental delta even if
-- the frontend calls it many times as the user logs more data that day.
create table if not exists public.daily_xp_sync (
    user_email  text not null,
    sync_date   date not null,
    xp_awarded  int not null default 0,
    updated_at  timestamptz not null default now(),
    primary key (user_email, sync_date)
);

-- ── sync_login_streak ────────────────────────────────────────────────────────
-- Atomic read-modify-write of the login streak + its XP bonus. `for update`
-- locks the row for the duration of the transaction so two near-simultaneous
-- calls (e.g. two tabs) can't both apply the increment.
create or replace function public.sync_login_streak(
    p_user_email text,
    p_client_date date,
    p_xp_amount int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile record;
    v_new_streak int;
begin
    select * into v_profile from user_profiles where user_email = p_user_email for update;
    if not found then
        return jsonb_build_object('streak_updated', false, 'new_streak', 0, 'xp_awarded', 0);
    end if;

    if v_profile.last_login_date = p_client_date then
        return jsonb_build_object('streak_updated', false, 'new_streak', coalesce(v_profile.login_streak, 0), 'xp_awarded', 0);
    end if;

    if v_profile.last_login_date = p_client_date - 1 then
        v_new_streak := coalesce(v_profile.login_streak, 0) + 1;
    else
        v_new_streak := 1;
    end if;

    update user_profiles
    set login_streak = v_new_streak,
        longest_streak = greatest(coalesce(longest_streak, 0), v_new_streak),
        last_login_date = p_client_date,
        total_xp = coalesce(total_xp, 0) + p_xp_amount
    where user_email = p_user_email;

    return jsonb_build_object('streak_updated', true, 'new_streak', v_new_streak, 'xp_awarded', p_xp_amount);
end;
$$;

-- ── sync_daily_xp ─────────────────────────────────────────────────────────────
-- Awards only the delta between what was already recorded for (user, date)
-- and the freshly-computed total, so repeated calls the same day never
-- double-award.
create or replace function public.sync_daily_xp(
    p_user_email text,
    p_date date,
    p_total_today int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_prev int := 0;
    v_diff int;
begin
    select xp_awarded into v_prev from daily_xp_sync where user_email = p_user_email and sync_date = p_date for update;
    if not found then
        v_prev := 0;
    end if;

    if p_total_today <= v_prev then
        return jsonb_build_object('xp_awarded', 0);
    end if;

    v_diff := p_total_today - v_prev;

    insert into daily_xp_sync (user_email, sync_date, xp_awarded, updated_at)
    values (p_user_email, p_date, p_total_today, now())
    on conflict (user_email, sync_date)
    do update set xp_awarded = excluded.xp_awarded, updated_at = now();

    update user_profiles set total_xp = coalesce(total_xp, 0) + v_diff where user_email = p_user_email;

    return jsonb_build_object('xp_awarded', v_diff);
end;
$$;

-- ── unlock_achievements ──────────────────────────────────────────────────────
-- p_candidates: jsonb array of {"id": "<achievement_id>", "xp": <int>}.
-- Filters out anything already in user_profiles.achievements, appends the
-- rest, and awards the summed XP — all in one locked read-modify-write.
-- Written for achievements being a native text[] column; if yours is jsonb,
-- swap the array_append/`= any()` logic below for jsonb_build_array/`?`.
create or replace function public.unlock_achievements(
    p_user_email text,
    p_candidates jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile record;
    v_earned text[];
    v_new_ids text[] := '{}';
    v_xp_total int := 0;
    v_item jsonb;
    v_id text;
    v_xp int;
begin
    select * into v_profile from user_profiles where user_email = p_user_email for update;
    if not found then
        return jsonb_build_object('new_achievement_ids', '[]'::jsonb, 'xp_awarded', 0);
    end if;

    v_earned := coalesce(v_profile.achievements, '{}');

    for v_item in select * from jsonb_array_elements(p_candidates)
    loop
        v_id := v_item->>'id';
        v_xp := coalesce((v_item->>'xp')::int, 0);
        if not (v_id = any(v_earned)) and not (v_id = any(v_new_ids)) then
            v_new_ids := array_append(v_new_ids, v_id);
            v_xp_total := v_xp_total + v_xp;
        end if;
    end loop;

    if array_length(v_new_ids, 1) is null then
        return jsonb_build_object('new_achievement_ids', '[]'::jsonb, 'xp_awarded', 0);
    end if;

    update user_profiles
    set achievements = v_earned || v_new_ids,
        total_xp = coalesce(total_xp, 0) + v_xp_total
    where user_email = p_user_email;

    return jsonb_build_object('new_achievement_ids', to_jsonb(v_new_ids), 'xp_awarded', v_xp_total);
end;
$$;
