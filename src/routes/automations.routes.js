import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { runAutomationsForUser } from '../services/automationService.js';

const router = Router();

// ── POST /api/automations/run ───────────────────────────────────────────────
// Replaces client-side automationEngine.runAutomations — the server derives
// its own snapshot from the log tables and dedupes "already ran today" via
// the automation_runs table instead of a spoofable localStorage key.
router.post('/run', requireAuth, async (req, res, next) => {
    try {
        const { client_date } = req.body || {};
        const result = await runAutomationsForUser({
            userEmail: req.user.email,
            userName: req.profile?.full_name || req.user.email,
            clientDate: client_date,
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
});

export default router;
