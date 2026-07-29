-- ============================================================================
-- FitQuest backend — base schema
-- ============================================================================
-- Run this FIRST, before 001_gamification.sql, in the Supabase SQL Editor of
-- a brand-new/empty project. It creates every table the application reads
-- and writes (derived directly from every frontend call site + backend
-- service file that touches each table — see the migration notes in
-- 001_gamification.sql for the same caveat: verify against your actual
-- project before relying on it in production).
--
-- Design notes:
--   * Every id is uuid default gen_random_uuid(), EXCEPT user_profiles.id,
--     which is always explicitly set by the backend to match the Supabase
--     Auth user's own id (profileService.ensureProfile, and the admin-setup
--     route) — never generated — and FKs to auth.users(id).
--   * user_email (text) is the ownership/join key everywhere, not a FK to
--     auth.users — matches how the entire app already queries these tables.
--   * RLS is enabled on every table with NO policies. This is intentional:
--     the backend only ever talks to Supabase using the service-role key,
--     which bypasses RLS entirely regardless of whether it's enabled — so
--     this has zero effect on the app. It exists purely as defense-in-depth:
--     if the anon/publishable key were ever leaked or misused, RLS-with-no-
--     policies means it still can't read or write a single row.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── nutrition ─────────────────────────────────────────────────────────────────
create table if not exists public.meal_logs (
    id          uuid primary key default gen_random_uuid(),
    user_email  text not null,
    date        date not null,
    meal_type   text,
    food_name   text,
    calories    numeric,
    protein     numeric,
    carbs       numeric,
    fats        numeric,
    photo_url   text,
    created_at  timestamptz not null default now()
);

create table if not exists public.recipes (
    id                uuid primary key default gen_random_uuid(),
    name              text not null,
    slug              text,
    description       text,
    meal_category     text,
    difficulty        text,
    cooking_time_min  numeric,
    servings          numeric,
    calories          numeric,
    protein           numeric,
    carbs             numeric,
    fats              numeric,
    fiber             numeric,
    sugar             numeric,
    ingredients       text[] not null default '{}',
    instructions      text[] not null default '{}',
    tips              text,
    tags              text[] not null default '{}',
    image_url         text,
    is_premium        boolean not null default false,
    is_published       boolean not null default false,
    created_at        timestamptz not null default now()
);

create table if not exists public.food_items (
    id                  uuid primary key default gen_random_uuid(),
    name                text not null,
    category            text,
    calories_per_100g   numeric,
    protein_per_100g    numeric,
    carbs_per_100g      numeric,
    fats_per_100g       numeric,
    fiber_per_100g      numeric,
    serving_size_g      numeric,
    serving_label       text,
    barcode             text,
    is_verified         boolean not null default false,
    is_popular          boolean not null default false,
    created_at          timestamptz not null default now()
);

create table if not exists public.grocery_lists (
    id              uuid primary key default gen_random_uuid(),
    user_email      text not null,
    name            text,
    items           jsonb not null default '[]'::jsonb,
    week_start      date,
    generated_from  text,
    created_at      timestamptz not null default now()
);

-- ── activity ──────────────────────────────────────────────────────────────────
create table if not exists public.workout_logs (
    id                uuid primary key default gen_random_uuid(),
    user_email        text not null,
    date              date not null,
    workout_type      text,
    name              text,
    duration_min      numeric,
    calories_burned   numeric,
    intensity         text,
    notes             text,
    created_at        timestamptz not null default now()
);

create table if not exists public.workout_plans (
    id                    uuid primary key default gen_random_uuid(),
    name                  text not null,
    description           text,
    category              text,
    difficulty            text,
    duration_weeks        int,
    days_per_week         int,
    estimated_calories    int,
    exercises             jsonb not null default '[]'::jsonb,
    image_url             text,
    is_premium            boolean not null default false,
    is_published          boolean not null default false,
    created_at            timestamptz not null default now()
);

create table if not exists public.workout_templates (
    id                    uuid primary key default gen_random_uuid(),
    name                  text not null,
    workout_type          text,
    default_duration_min  int,
    cal_per_min           numeric,
    intensity             text,
    emoji                 text,
    is_active             boolean not null default true,
    sort_order            int not null default 0,
    created_at            timestamptz not null default now()
);

create table if not exists public.step_logs (
    id                uuid primary key default gen_random_uuid(),
    user_email        text not null,
    date              date not null,
    steps             numeric,
    calories_burned   numeric,
    created_at        timestamptz not null default now()
);

create table if not exists public.exercises (
    id                uuid primary key default gen_random_uuid(),
    name              text not null,
    muscle_group      text,
    difficulty        text,
    equipment         text,
    category          text,
    instructions      text,
    common_mistakes   text,
    tips              text,
    image_url         text,
    video_url         text,
    created_at        timestamptz not null default now()
);

-- ── wellness ──────────────────────────────────────────────────────────────────
create table if not exists public.sleep_logs (
    id          uuid primary key default gen_random_uuid(),
    user_email  text not null,
    date        date not null,
    hours       numeric,
    bed_time    text,
    wake_time   text,
    quality     text,
    created_at  timestamptz not null default now()
);

create table if not exists public.water_logs (
    id          uuid primary key default gen_random_uuid(),
    user_email  text not null,
    date        date not null,
    amount_ml   numeric,
    time        text,
    created_at  timestamptz not null default now()
);

create table if not exists public.weight_logs (
    id          uuid primary key default gen_random_uuid(),
    user_email  text not null,
    date        date not null,
    weight_kg   numeric,
    notes       text,
    created_at  timestamptz not null default now()
);

create table if not exists public.supplement_logs (
    id                uuid primary key default gen_random_uuid(),
    user_email        text not null,
    date              date not null,
    supplement_name   text,
    dose              text,
    taken_at          timestamptz,
    taken             boolean not null default true,
    timing            text,
    brand             text,
    created_at        timestamptz not null default now()
);

create table if not exists public.user_supplements (
    id            uuid primary key default gen_random_uuid(),
    user_email    text not null,
    name          text not null,
    brand         text,
    dosage        text,
    timing        text,
    category      text,
    instructions  text,
    is_active     boolean not null default true,
    created_at    timestamptz not null default now()
);

create table if not exists public.body_progress (
    id                uuid primary key default gen_random_uuid(),
    user_email        text not null,
    date              date not null,
    period            text,
    front_photo_url   text,
    side_photo_url    text,
    back_photo_url    text,
    weight_kg         numeric,
    chest_cm          numeric,
    waist_cm          numeric,
    hips_cm           numeric,
    arms_cm           numeric,
    thighs_cm         numeric,
    body_fat_pct      numeric,
    notes             text,
    mood              text,
    energy_level      int,
    milestone_tags    text[] not null default '{}',
    created_at        timestamptz not null default now()
);

-- ── gamification catalog/rules ───────────────────────────────────────────────
create table if not exists public.achievements (
    id                uuid primary key default gen_random_uuid(),
    achievement_id    text not null unique,
    name              text not null,
    description       text,
    icon              text,
    color             text,
    xp_reward         int not null default 0,
    category          text,
    threshold         numeric,
    is_active         boolean not null default true,
    sort_order        int not null default 0,
    created_at        timestamptz not null default now()
);

create table if not exists public.missions (
    id                    uuid primary key default gen_random_uuid(),
    mission_id            text not null unique,
    label                 text not null,
    description           text,
    icon                  text,
    xp_reward             int not null default 0,
    color_hex             text,
    metric                text,
    target_value          numeric,
    target_pct_of_goal    numeric,
    is_active             boolean not null default true,
    is_bonus              boolean not null default false,
    sort_order            int not null default 0,
    created_at            timestamptz not null default now()
);

create table if not exists public.challenges (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    type            text,
    duration_days   int,
    description     text,
    reward_badge    text,
    prize           text,
    is_active       boolean not null default true,
    start_date      date,
    end_date        date,
    created_at      timestamptz not null default now()
);

create table if not exists public.automations (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    trigger         text,
    trigger_value   numeric,
    action          text,
    action_value    text,
    is_active       boolean not null default true,
    run_count       int not null default 0,
    created_at      timestamptz not null default now()
);

-- ── ai-coach ──────────────────────────────────────────────────────────────────
create table if not exists public.coach_plans (
    id                uuid primary key default gen_random_uuid(),
    user_email        text not null,
    plan_type         text,
    title             text,
    description       text,
    calorie_target    numeric,
    protein_target    numeric,
    step_target       numeric,
    water_target_ml   numeric,
    notes             text,
    status            text,
    assigned_by       text,
    start_date        date,
    created_at        timestamptz not null default now()
);

-- ── messaging ─────────────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
    id          uuid primary key default gen_random_uuid(),
    user_email  text not null,
    sender      text not null,
    text        text,
    sent_at     timestamptz,
    read        boolean not null default false,
    created_at  timestamptz not null default now()
);

-- ── profile / platform ───────────────────────────────────────────────────────
create table if not exists public.user_profiles (
    id                        uuid primary key references auth.users(id) on delete cascade,
    user_email                text not null unique,
    full_name                 text,
    role                      text not null default 'user',
    plan                      text not null default 'free',
    phone                     text,
    avatar_url                text,
    age                       int,
    height_cm                 numeric,
    weight_kg                 numeric,
    target_weight_kg          numeric,
    fitness_goal              text,
    activity_level            text,
    sleep_hours               numeric,
    workout_frequency         int,
    daily_calorie_target      int,
    protein_target            int,
    carb_target               int,
    fat_target                int,
    water_goal_ml             int,
    step_goal                 int,
    onboarding_complete       boolean not null default false,
    achievements              text[] not null default '{}',
    login_streak              int not null default 0,
    longest_streak            int not null default 0,
    last_login_date           date,
    total_xp                  int not null default 0,
    last_mission_sync_date    date,
    last_mission_xp           int,
    dashboard_layout          jsonb,
    admin_dashboard_layout    jsonb,
    widget_sizes              jsonb,
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now()
);

create table if not exists public.feature_flags (
    id              uuid primary key default gen_random_uuid(),
    feature_id      text not null unique,
    label           text,
    is_enabled      boolean not null default true,
    required_plan   text not null default 'free',
    is_beta         boolean not null default false,
    sort_order      int not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table if not exists public.user_feature_overrides (
    id             uuid primary key default gen_random_uuid(),
    user_email     text not null,
    feature_id     text not null,
    override_type  text not null,
    granted_by     text,
    is_active      boolean not null default true,
    expires_at     timestamptz,
    reason         text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create table if not exists public.testimonials (
    id                  uuid primary key default gen_random_uuid(),
    client_name         text,
    testimonial_text    text,
    before_image_url    text,
    after_image_url     text,
    weight_change_kg    numeric,
    duration_weeks      int,
    program_name        text,
    video_url           text,
    rating              int,
    is_featured         boolean not null default false,
    is_published        boolean not null default false,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create table if not exists public.programs (
    id                  uuid primary key default gen_random_uuid(),
    name                text not null,
    description         text,
    target_audience     text,
    duration_weeks      int,
    difficulty          text,
    category            text,
    included_features   text[] not null default '{}',
    price               numeric,
    original_price      numeric,
    banner_image_url    text,
    is_featured         boolean not null default false,
    is_published        boolean not null default false,
    required_plan       text not null default 'free',
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- ── admin ─────────────────────────────────────────────────────────────────────
create table if not exists public.admin_notes (
    id           uuid primary key default gen_random_uuid(),
    user_email   text not null,
    admin_email  text,
    note         text,
    category     text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create table if not exists public.admin_tasks (
    id                 uuid primary key default gen_random_uuid(),
    title              text not null,
    description        text,
    priority           text,
    type               text,
    status             text not null default 'todo',
    due                text,
    is_user_specific   boolean not null default false,
    user_email         text,
    sort_order         bigint not null default 0,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

-- ── lock every table down from anon/authenticated roles (service-role only) ──
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
            'admin_notes','admin_tasks'
        ])
    loop
        execute format('alter table public.%I enable row level security;', t);
    end loop;
end $$;
