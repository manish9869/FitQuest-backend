import { config } from '../config/env.js';

// Shared cookie options for the session pair. httpOnly so JS on the frontend
// can never read the token (that's the whole point of moving auth server-side
// — even an XSS bug on the frontend can't exfiltrate a Supabase session from
// here). SameSite=None is required for a cross-origin frontend (different
// host/port than this API) to send the cookie at all, but SameSite=None is
// only honored by browsers when Secure is also set — so in real deployments
// COOKIE_SECURE=true (HTTPS) is not optional, it's required for login to work.
function baseOptions(maxAge) {
    return {
        httpOnly: true,
        secure: config.cookie.secure,
        sameSite: config.cookie.secure ? 'none' : 'lax',
        domain: config.cookie.domain,
        path: '/',
        maxAge,
    };
}

const ACCESS_MAX_AGE = 60 * 60 * 1000; // 1h — refreshed transparently by requireAuth
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30d
const PKCE_MAX_AGE = 10 * 60 * 1000; // 10m — only needs to survive the OAuth round trip

export function setSessionCookies(res, session) {
    if (!session?.access_token) return;
    res.cookie('sb_at', session.access_token, baseOptions(ACCESS_MAX_AGE));
    if (session.refresh_token) {
        res.cookie('sb_rt', session.refresh_token, baseOptions(REFRESH_MAX_AGE));
    }
}

export function clearSessionCookies(res) {
    const opts = { ...baseOptions(0), maxAge: undefined };
    res.clearCookie('sb_at', opts);
    res.clearCookie('sb_rt', opts);
}

export function setPkceCookie(res, verifier) {
    res.cookie('sb_pkce_verifier', verifier, baseOptions(PKCE_MAX_AGE));
}

export function clearPkceCookie(res) {
    res.clearCookie('sb_pkce_verifier', { ...baseOptions(0), maxAge: undefined });
}
