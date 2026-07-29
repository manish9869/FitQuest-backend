import { Router } from 'express';
import { mountResource } from './_mount.js';

const router = Router();

mountResource(router, 'chat-messages', 'chat_messages');

export default router;
