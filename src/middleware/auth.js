import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { setSessionCookies, clearSessionCookies } from '../utils/cookies.js';

// ── requireAuth ───────────────────────────────────────────────────────────────
// The frontend never sees a Supabase token at all — it's held in an httpOnly
// `sb_at` cookie (short-lived) plus an httpOnly `sb_rt` refresh cookie
// (long-lived), both set by the /api/auth routes. The browser just sends them
// automatically (fetch with credentials:'include'); this middleware verifies
// `sb_at` via supabase.auth.getUser(token) — the Supabase-recommended
// server-side verification path (round-trips to Supabase's auth server, so
// it's correct even across signing-key rotation, no separate JWT secret to
// manage/leak) — and transparently refreshes via `sb_rt` if `sb_at` is
// missing/expired, re-issuing both cookies before continuing.
//
// This is what closes the reviewed admin-escalation hole: the client can no
// longer just claim a role, nor even hold its own Supabase token. req.isAdmin
// is derived here, server-side, from the user_profiles row itself — every
// downstream route trusts req.isAdmin, never anything the client sends.
export async function requireAuth(req, res, next) {
    try {
        const supabase = getSupabaseAdmin();
        let token = req.cookies?.sb_at || null;
        let user = null;

        if (token) {
            const { data, error } = await supabase.auth.getUser(token);
            if (!error && data?.user) user = data.user;
        }

        if (!user) {
            const refreshToken = req.cookies?.sb_rt || null;
            if (!refreshToken) return res.status(401).json({ error: 'Not authenticated.' });

            const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
            if (error || !data?.session?.user) {
                clearSessionCookies(res);
                return res.status(401).json({ error: 'Session expired.' });
            }

            setSessionCookies(res, data.session);
            user = data.session.user;
        }

        if (!user.email) return res.status(401).json({ error: 'Invalid session.' });

        req.user = { id: user.id, email: user.email, full_name: user.user_metadata?.full_name || '' };

        const { data: profile, error: profileErr } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_email', req.user.email)
            .maybeSingle();

        if (profileErr) throw profileErr;

        req.profile = profile || null;
        req.isAdmin = profile?.role === 'admin';

        next();
    } catch (err) {
        next(err);
    }
}

export function requireAdmin(req, res, next) {
    if (!req.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
    next();
}
