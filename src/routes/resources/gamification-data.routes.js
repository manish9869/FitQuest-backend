import { Router } from 'express';
import { mountResource } from './_mount.js';

// Distinct from routes/gamification.routes.js (login-streak/sync-daily/
// check-achievements — the server-authoritative RPC-driven endpoints).
// This file is plain CRUD over the catalog/rule tables themselves
// (mostly admin-managed content, read by everyone).
const router = Router();

mountResource(router, 'achievements', 'achievements');
mountResource(router, 'missions', 'missions');
mountResource(router, 'challenges', 'challenges');
mountResource(router, 'automation-rules', 'automations');

export default router;
