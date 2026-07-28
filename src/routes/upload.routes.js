import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/security.js';
import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { getTablePolicy, isKnownTable } from '../config/tablePolicies.js';
import { config } from '../config/env.js';

const router = Router();

// Every upload today is an image (recipe/exercise/program/testimonial/blog
// cover art, avatars, body-progress photos, AI food-scan snapshots) — no PDF
// or other file type is ever sent, so this is a real allowlist, not a guess.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']);
const MAX_BYTES = 8 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES },
    fileFilter: (req, file, cb) => {
        cb(null, ALLOWED_MIME.has(file.mimetype));
    },
});

// body_progress photos are personal/sensitive — keep them out of the public
// bucket entirely and hand back a time-limited signed URL instead.
const PRIVATE_TABLES = new Set(['body_progress']);

// ── POST /api/upload?table=<table> ──────────────────────────────────────────
router.post('/', requireAuth, uploadLimiter, upload.single('file'), async (req, res, next) => {
    try {
        const table = req.query.table;
        if (!table || !isKnownTable(table)) return res.status(404).json({ error: 'Unknown table.' });

        const policy = getTablePolicy(table);
        const canWrite = req.isAdmin || policy.create === 'own' || policy.create === 'public';
        if (!canWrite) return res.status(403).json({ error: 'Not allowed.' });

        if (!req.file) return res.status(400).json({ error: 'No file provided, or file type/size rejected.' });

        const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
        const path = `${table}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const isPrivate = PRIVATE_TABLES.has(table);
        const bucket = isPrivate ? config.supabase.privateBucket : config.supabase.publicBucket;

        const supabase = getSupabaseAdmin();
        const { error: uploadErr } = await supabase.storage
            .from(bucket)
            .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
        if (uploadErr) throw uploadErr;

        if (isPrivate) {
            const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
            if (error) throw error;
            return res.json({ file_url: data.signedUrl });
        }

        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        res.json({ file_url: data.publicUrl });
    } catch (err) {
        next(err);
    }
});

export default router;
