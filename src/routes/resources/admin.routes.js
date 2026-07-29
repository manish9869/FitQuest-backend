import { Router } from 'express';
import { mountResource } from './_mount.js';

const router = Router();

mountResource(router, 'admin-notes', 'admin_notes');
mountResource(router, 'admin-tasks', 'admin_tasks');

export default router;
