import { Router } from 'express';
import { mountResource } from './_mount.js';

const router = Router();

mountResource(router, 'user-profiles', 'user_profiles');
mountResource(router, 'user-feature-overrides', 'user_feature_overrides');

export default router;
