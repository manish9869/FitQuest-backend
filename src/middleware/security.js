import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import compression from 'compression';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

// credentials: true is required now — auth is a browser-set httpOnly cookie
// (sb_at/sb_rt), not a bearer header the client attaches itself. That also
// means the origin reflection below can never fall back to "*"; cross-origin
// cookie requests are only honored for origins on the allowlist.
export const corsMiddleware = cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, !config.isProd);
        if (!config.allowedOrigins.length || config.allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        logger.warn(`CORS blocked: ${origin}`);
        callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
});

export const helmetMiddleware = helmet();

// Global — generous enough for a dashboard app polling a few queries per page,
// tight enough to blunt scripted abuse.
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});

// Admin-setup — the ONLY place an invite code is checked. Tight: this is a
// brute-force target now that the code lives server-side instead of in the
// client bundle.
export const adminSetupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
});

// Login/signup — a credential-stuffing / account-enumeration target now that
// it's a plain POST endpoint instead of going straight to Supabase's own
// (already rate-limited) GoTrue API.
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
});

// Uploads — file I/O + storage writes, more expensive than a plain data call.
export const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many uploads. Please try again later.' },
});

// LLM proxy — this is a metered, billable third-party call. Cap hard.
export const llmLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI requests. Please try again later.' },
});

export const compressionMiddleware = compression();
