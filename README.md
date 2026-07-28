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

**Required one-time step:** open the Supabase SQL Editor for your project and
run `sql/001_gamification.sql`. It creates the `automation_runs` /
`daily_xp_sync` tables and the `sync_login_streak` / `sync_daily_xp` /
`unlock_achievements` RPC functions the gamification routes call. Read the
assumptions comment at the top of that file first — it's written against the
column types the app's existing queries imply (e.g. `achievements` as
`text[]`), and asks you to confirm/adjust if your schema differs.

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
- `GET|POST|PATCH|DELETE /api/data/:table[/:id]`, `POST /api/data/:table/upsert`
  — generic CRUD, table names match `src/config/tablePolicies.js` keys
- `POST /api/upload?table=<table>` — multipart `file` field
- `POST /api/llm/invoke` — `{prompt, response_json_schema}` → Groq, proxied
- `POST /api/gamification/{login-streak,sync-daily,check-achievements}`
- `POST /api/automations/run`

## Deploying alongside a white-labeled frontend

This backend and the FitQuest frontend are two independent deployables. There
is no in-app theming/branding system — any external, differently-branded
marketing or landing site plugs in by simply **linking** its "Get Started" /
"Login" button at the deployed frontend's URL (e.g. `https://app.yoursite.com/login`).
Add that frontend origin to `ALLOWED_ORIGINS` here; the marketing site itself
never needs to call this API directly.
