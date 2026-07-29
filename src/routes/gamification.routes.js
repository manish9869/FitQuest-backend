import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { gamificationLimiter } from '../middleware/security.js';
import { updateLoginStreak, syncDailyProgress, checkAndUnlockAchievements } from '../services/gamificationService.js';

const router = Router();

router.use(requireAuth, gamificationLimiter);

// ── POST /api/gamification/login-streak ─────────────────────────────────────
// Called once per session on dashboard mount. Replaces the old client-side
// xpEngine.updateLoginStreak, which trusted the browser's own read-modify-
// write of total_xp/login_streak — now computed and applied entirely
// server-side (see sync_login_streak in sql/001).
router.post('/login-streak', async (req, res, next) => {
    try {
        const { client_date } = req.body || {};
        const result = await updateLoginStreak(req.user.email, client_date);
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// ── POST /api/gamification/sync-daily ───────────────────────────────────────
// Replaces DailyMissions.jsx's inline mission/bonus/challenge XP calculation
// and its direct entities.UserProfile.update(...) award — the server derives
// today's completion state itself from the log tables instead of trusting a
// client-computed total.
router.post('/sync-daily', async (req, res, next) => {
    try {
        const { client_date } = req.body || {};
        const result = await syncDailyProgress(req.user.email, client_date);
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// ── POST /api/gamification/check-achievements ───────────────────────────────
// Replaces MessageNotifier.jsx's client-side checkAchievements + awardXP.
router.post('/check-achievements', async (req, res, next) => {
    try {
        const result = await checkAndUnlockAchievements(req.user.email);
        res.json(result);
    } catch (err) {
        next(err);
    }
});

export default router;
