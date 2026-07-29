import { Router } from 'express';
import { mountResource } from './_mount.js';

const router = Router();

mountResource(router, 'feature-flags', 'feature_flags');
mountResource(router, 'testimonials', 'testimonials');
mountResource(router, 'programs', 'programs');

export default router;
