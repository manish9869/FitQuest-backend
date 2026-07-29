import { Router } from 'express';
import { mountResource } from './_mount.js';

const router = Router();

mountResource(router, 'workout-logs', 'workout_logs');
mountResource(router, 'workout-plans', 'workout_plans');
mountResource(router, 'workout-templates', 'workout_templates');
mountResource(router, 'step-logs', 'step_logs');
mountResource(router, 'exercises', 'exercises');

export default router;
