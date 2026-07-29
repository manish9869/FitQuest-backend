import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/security.js';
import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { getTablePolicy } from '../config/tablePolicies.js';
import { config } from '../config/env.js';

const router = Router();

// Every upload today is an image (recipe/exercise/program/testimonial cover
// art, avatars, body-progress photos, AI food-scan snapshots) — no PDF or
// other file type is ever sent, so this is a real allowlist, not a guess.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']);
const MAX_BYTES = 8 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES },
    fileFilter: (req, file, cb) => {
        // Content-Type is a client-supplied header — trivially spoofable
        // (e.g. an attacker naming an arbitrary file "photo.jpg" with a
        // forged image/jpeg header). This only filters obviously-wrong
        // uploads early; the real check is matchesDeclaredType() below,
        // which inspects the actual file bytes once multer has the buffer.
        cb(null, ALLOWED_MIME.has(file.mimetype));
    },
});

// Real content validation via magic bytes — the declared mimetype/filename
// is never trusted alone. Covers every format in ALLOWED_MIME.
function matchesDeclaredType(buffer, mimetype) {
    if (!buffer || buffer.length < 12) return false;
    const b = buffer;
    switch (mimetype) {
        case 'image/jpeg':
            return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
        case 'image/png':
            return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
        case 'image/gif':
            return b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a';
        case 'image/webp':
            return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
        case 'image/heic':
            // ISO base media file format: 4-byte size, then 'ftyp', then a brand
            return b.toString('ascii', 4, 8) === 'ftyp';
        default:
            return false;
    }
}

// Named upload purposes, not client-chosen table names — the client picks
// one of these 7 fixed targets, never an arbitrary table. body-progress-photo
// is the only one routed to the private bucket (personal/sensitive photos,
// signed URLs only, never publicly listable).
const UPLOAD_TARGETS = {
    avatar: { table: 'user_profiles' },
    'recipe-image': { table: 'recipes' },
    'exercise-image': { table: 'exercises' },
    'program-image': { table: 'programs' },
    'testimonial-image': { table: 'testimonials' },
    'meal-photo': { table: 'meal_logs' },
    'body-progress-photo': { table: 'body_progress', private: true },
};

// ── POST /api/uploads/:target ───────────────────────────────────────────────
router.post('/:target', requireAuth, uploadLimiter, upload.single('file'), async (req, res, next) => {
    try {
        const target = UPLOAD_TARGETS[req.params.target];
        if (!target) return res.status(404).json({ error: 'Unknown upload target.' });

        const policy = getTablePolicy(target.table);
        const canWrite = req.isAdmin || policy.create === 'own' || policy.create === 'public';
        if (!canWrite) return res.status(403).json({ error: 'Not allowed.' });

        if (!req.file) return res.status(400).json({ error: 'No file provided, or file type/size rejected.' });
        if (!matchesDeclaredType(req.file.buffer, req.file.mimetype)) {
            return res.status(400).json({ error: 'File content does not match its declared type.' });
        }

        const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
        const path = `${target.table}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const bucket = target.private ? config.supabase.privateBucket : config.supabase.publicBucket;

        const supabase = getSupabaseAdmin();
        const { error: uploadErr } = await supabase.storage
            .from(bucket)
            .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
        if (uploadErr) throw uploadErr;

        if (target.private) {
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
