import { Router } from 'express';
import { mountResource } from './_mount.js';

const router = Router();

mountResource(router, 'coach-plans', 'coach_plans');

export default router;
