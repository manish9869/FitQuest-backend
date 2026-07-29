# FitQuest Backend

Owns all Supabase access (data, storage, auth, LLM proxy) so the frontend
never talks to Supabase or holds any API key. Authorization is enforced here
in code (`src/config/tablePolicies.js`) using the Supabase **service-role**
key — not by forwarding a user's own token and relying on RLS — because RLS
alone doesn't stop a user from writing to columns on their *own* row (e.g.
`role`, `total_xp`) that they shouldn't be able to touch. `tablePolicies.js`
strips those fields server-side regardless of what the client sends.

## Setup

```bash
npm install
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, ADMIN_INVITE_CODE
npm run dev
```

**Required one-time step (fresh/empty Supabase project):** open the Supabase
SQL Editor for your project and run, in order:

1. `sql/000_schema.sql` — creates all ~28 application tables (derived from
   every column the frontend/backend actually read and write), with RLS
   enabled and no policies (service-role key bypasses RLS regardless — this
   is just defense-in-depth against a leaked anon key).
2. `sql/001_gamification.sql` — creates the `automation_runs` /
   `daily_xp_sync` tables and the `sync_login_streak` / `sync_daily_xp` /
   `unlock_achievements` RPC functions the gamification routes call. Depends
   on `automations` and `user_profiles` from step 1.
3. `sql/002_service_role_policies.sql` — grants `service_role` explicit
   access via policy on every table. On some projects the service-role key
   doesn't get automatic RLS bypass through PostgREST (confirmed on this
   project even with a genuine `service_role`-claimed JWT — writes were
   rejected with `42501` until this ran). Run this regardless; it's a no-op
   if your project's automatic bypass does work.

If you're pointing at a Supabase project that already has this app's tables
from before, skip `000_schema.sql` (or diff it against your schema first) and
just run `001_gamification.sql`.

## How auth works

The frontend has zero Supabase code and zero Supabase keys. It calls this
backend's `/api/auth/*` routes with `credentials: 'include'`; on success this
server sets two httpOnly cookies (`sb_at`, `sb_rt` — a Supabase access token
and refresh token) that the browser can't read or exfiltrate via XSS. Every
other route requires those cookies via `requireAuth`, which verifies/refreshes
them and derives `req.isAdmin` from the user's own `user_profiles` row — never
from anything the client claims.

`COOKIE_SECURE=true` (and therefore HTTPS) is **required** in any real
deployment — cross-origin cookies need `SameSite=None`, which browsers only
honor alongside `Secure`.

## Routes

- `POST /api/auth/{login,signup,admin-setup,logout}`, `GET /api/auth/session`,
  `GET /api/auth/google/{start,callback}`, `PATCH /api/auth/profile`
- Named, fixed-path resource routes — no client-supplied table name, no
  wildcard route. Each of `src/routes/resources/*.routes.js` registers a
  handful of hardcoded `(URL path, SQL table)` pairs via the shared
  `mountResource()` helper (`src/routes/resources/_mount.js`), which still
  delegates to the one policy-checked `dataController.js` under the hood —
  only *how the client reaches it* changed. Every resource gets the standard
  verb set: `GET /api/<resource>`, `GET/PATCH/DELETE /api/<resource>/:id`,
  `POST /api/<resource>`, `POST /api/<resource>/upsert`. Current resources:
  `meals`, `recipes`, `food-items`, `grocery-lists`, `workout-logs`,
  `workout-plans`, `workout-templates`, `step-logs`, `exercises`,
  `sleep-logs`, `water-logs`, `weight-logs`, `supplement-logs`,
  `user-supplements`, `body-progress`, `achievements`, `missions`,
  `challenges`, `automation-rules`, `coach-plans`, `chat-messages`,
  `user-profiles`, `user-feature-overrides`, `feature-flags`, `testimonials`,
  `programs`, `admin-notes`, `admin-tasks`.
- `POST /api/uploads/:target` — multipart `file` field, `:target` is one of a
  fixed whitelist (`avatar`, `recipe-image`, `exercise-image`,
  `program-image`, `testimonial-image`, `meal-photo`,
  `body-progress-photo`) in `routes/upload.routes.js`, each hardcoded to its
  own table/bucket.
- `POST /api/llm/invoke` — `{prompt, response_json_schema}` → Groq, proxied
- `POST /api/gamification/{login-streak,sync-daily,check-achievements}`
- `POST /api/automations/run`

Adding a new resource is a one-line `mountResource(router, 'path', 'table')`
call in the right domain file under `src/routes/resources/` (plus a
`TABLE_POLICIES` entry in `tablePolicies.js` if the table is new) — not a new
handler.

## Auto-created profiles

There's no onboarding wizard gating signup. `src/services/profileService.js`
(`ensureProfile`) runs after every successful login/signup/Google callback
and creates a default `user_profiles` row (generic body-stat defaults,
computed calorie/macro targets) the first time it sees a user with none —
login goes straight to the dashboard, and real stats get filled in later via
Profile/Settings.

## Deploying alongside a white-labeled frontend

This backend and the FitQuest frontend are two independent deployables. There
is no in-app theming/branding system — any external, differently-branded
marketing or landing site plugs in by simply **linking** its "Get Started" /
"Login" button at the deployed frontend's URL (e.g. `https://app.yoursite.com/login`).
Add that frontend origin to `ALLOWED_ORIGINS` here; the marketing site itself
never needs to call this API directly.
