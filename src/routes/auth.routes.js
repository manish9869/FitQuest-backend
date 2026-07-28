import { Router } from 'express';
import crypto from 'crypto';
import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, adminSetupLimiter } from '../middleware/security.js';
import { setSessionCookies, clearSessionCookies, setPkceCookie, clearPkceCookie } from '../utils/cookies.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

const router = Router();

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res, next) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return res.status(401).json({ error: error.message });

        setSessionCookies(res, data.session);
        res.json({ user: { id: data.user.id, email: data.user.email } });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/auth/signup ───────────────────────────────────────────────────
router.post('/signup', authLimiter, async (req, res, next) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return res.status(400).json({ error: error.message });

        if (data.session) {
            setSessionCookies(res, data.session);
            return res.json({ user: { id: data.user.id, email: data.user.email }, pending: false });
        }

        // Email confirmation is ON for this project — no session yet.
        res.json({ pending: true, message: 'Check your inbox to confirm your email, then sign in.' });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/auth/admin-setup ──────────────────────────────────────────────
// The invite code check now happens here, server-side, instead of being a
// hardcoded fallback string shipped in the client bundle.
router.post('/admin-setup', adminSetupLimiter, async (req, res, next) => {
    try {
        const { code, email, password, fullName } = req.body || {};
        if (!code || code !== config.adminInviteCode) {
            return res.status(403).json({ error: 'Invalid invite code.' });
        }
        if (!email || !password || !fullName?.trim()) {
            return res.status(400).json({ error: 'Full name, email and password are required.' });
        }

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return res.status(400).json({ error: error.message });

        const userEmail = data.user?.email || email;

        if (!data.session) {
            return res.json({ pending: true, message: 'Check your inbox to confirm your email, then sign in at /login — admin access will be applied automatically.' });
        }

        const { error: profileErr } = await supabase
            .from('user_profiles')
            .upsert({
                user_email: userEmail,
                full_name: fullName.trim(),
                role: 'admin',
                onboarding_complete: true,
                plan: 'elite',
            }, { onConflict: 'user_email' });

        if (profileErr) {
            logger.error('admin-setup profile upsert failed', { error: profileErr.message });
            return res.status(500).json({ error: 'Failed to create admin profile.' });
        }

        setSessionCookies(res, data.session);
        res.json({ user: { id: data.user.id, email: userEmail }, role: 'admin' });
    } catch (err) {
        next(err);
    }
});

// ── GET /api/auth/google/start ──────────────────────────────────────────────
// Hand-rolled PKCE flow — we can't use supabase-js's browser PKCE helper
// (relies on localStorage), so we drive the exchange directly against
// GoTrue's REST API instead of trusting an SDK client's internal storage.
router.get('/google/start', (req, res) => {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    setPkceCookie(res, verifier);

    const redirectTo = `${config.backendUrl}/api/auth/google/callback`;
    const authorizeUrl = `${config.supabase.url}/auth/v1/authorize` +
        `?provider=google&redirect_to=${encodeURIComponent(redirectTo)}` +
        `&code_challenge=${challenge}&code_challenge_method=s256`;

    res.redirect(authorizeUrl);
});

// ── GET /api/auth/google/callback ───────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
    const failRedirect = `${config.frontendUrl}/login?error=oauth_failed`;
    try {
        const code = req.query.code;
        const verifier = req.cookies?.sb_pkce_verifier;
        clearPkceCookie(res);
        if (!code || !verifier) return res.redirect(failRedirect);

        const resp = await fetch(`${config.supabase.url}/auth/v1/token?grant_type=pkce`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: config.supabase.serviceRoleKey,
            },
            body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
        });

        if (!resp.ok) {
            logger.warn('Google OAuth code exchange failed', { status: resp.status });
            return res.redirect(failRedirect);
        }

        const session = await resp.json();
        setSessionCookies(res, session);
        res.redirect(`${config.frontendUrl}/dashboard`);
    } catch (err) {
        logger.error('Google OAuth callback error', { error: err.message });
        res.redirect(failRedirect);
    }
});

// ── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
    const token = req.cookies?.sb_at;
    if (token) {
        try {
            await getSupabaseAdmin().auth.admin.signOut(token, 'global');
        } catch (err) {
            logger.warn('signOut revoke failed (cookies still cleared)', { error: err.message });
        }
    }
    clearSessionCookies(res);
    res.json({ success: true });
});

// ── GET /api/auth/session ───────────────────────────────────────────────────
router.get('/session', requireAuth, (req, res) => {
    res.json({
        user: req.user,
        role: req.profile?.role || 'user',
        profile: req.profile,
    });
});

// ── PATCH /api/auth/profile ─────────────────────────────────────────────────
// Self-service display-name update — replaces the frontend's direct
// supabase.auth.updateUser({data:{full_name}}) call.
router.patch('/profile', requireAuth, async (req, res, next) => {
    try {
        const { full_name } = req.body || {};
        if (typeof full_name !== 'string' || !full_name.trim()) {
            return res.status(400).json({ error: 'full_name is required.' });
        }

        const supabase = getSupabaseAdmin();
        const { error } = await supabase.auth.admin.updateUserById(req.user.id, {
            user_metadata: { full_name: full_name.trim() },
        });
        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

export default router;
