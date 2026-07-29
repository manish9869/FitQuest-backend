import { Router } from 'express';
import { mountResource } from './_mount.js';

const router = Router();

mountResource(router, 'sleep-logs', 'sleep_logs');
mountResource(router, 'water-logs', 'water_logs');
mountResource(router, 'weight-logs', 'weight_logs');
mountResource(router, 'supplement-logs', 'supplement_logs');
mountResource(router, 'user-supplements', 'user_supplements');
mountResource(router, 'body-progress', 'body_progress');

export default router;
