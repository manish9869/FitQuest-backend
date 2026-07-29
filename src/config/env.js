import dotenv from 'dotenv';
dotenv.config();

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

for (const key of required) {
    if (!process.env[key]) {
        console.error(`❌  Missing required env var: ${key}`);
        process.exit(1);
    }
}

export const config = {
    port: parseInt(process.env.PORT || '3002', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    isProd: process.env.NODE_ENV === 'production',

    backendUrl: process.env.BACKEND_URL || `http://localhost:${process.env.PORT || '3002'}`,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

    cookie: {
        secure: process.env.COOKIE_SECURE === 'true',
        domain: process.env.COOKIE_DOMAIN || undefined,
    },

    supabase: {
        url: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        publicBucket: process.env.SUPABASE_PUBLIC_BUCKET || 'uploads',
        privateBucket: process.env.SUPABASE_PRIVATE_BUCKET || 'private-uploads',
    },

    adminInviteCode: process.env.ADMIN_INVITE_CODE || '',

    groqApiKey: process.env.GROQ_API_KEY || '',
    // Vision-capable — used only for requests that include an image
    // (e.g. the Food Scanner), since Groq's models on this account are
    // text-only. Everything else keeps using Groq.
    geminiApiKey: process.env.GEMINI_API_KEY || '',

    allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
        : [],
};
