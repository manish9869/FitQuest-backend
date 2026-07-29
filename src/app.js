import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import logger from './config/logger.js';
import { corsMiddleware, helmetMiddleware, compressionMiddleware, globalLimiter } from './middleware/security.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import llmRoutes from './routes/llm.routes.js';
import gamificationRoutes from './routes/gamification.routes.js';
import automationsRoutes from './routes/automations.routes.js';

import nutritionResourceRoutes from './routes/resources/nutrition.routes.js';
import activityResourceRoutes from './routes/resources/activity.routes.js';
import wellnessResourceRoutes from './routes/resources/wellness.routes.js';
import gamificationDataRoutes from './routes/resources/gamification-data.routes.js';
import coachResourceRoutes from './routes/resources/coach.routes.js';
import messagingResourceRoutes from './routes/resources/messaging.routes.js';
import profileResourceRoutes from './routes/resources/profile.routes.js';
import platformResourceRoutes from './routes/resources/platform.routes.js';
import adminResourceRoutes from './routes/resources/admin.routes.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(compressionMiddleware);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);
app.use(globalLimiter);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/automations', automationsRoutes);

// Named, fixed-path resource routers — replaces the old generic
// /api/data/:table wildcard. Each mounts several hardcoded resource paths
// directly at /api (e.g. /api/meals, /api/water-logs); see routes/resources/.
app.use('/api', nutritionResourceRoutes);
app.use('/api', activityResourceRoutes);
app.use('/api', wellnessResourceRoutes);
app.use('/api', gamificationDataRoutes);
app.use('/api', coachResourceRoutes);
app.use('/api', messagingResourceRoutes);
app.use('/api', profileResourceRoutes);
app.use('/api', platformResourceRoutes);
app.use('/api', adminResourceRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
    logger.info(`FitQuest backend listening on port ${config.port} (${config.nodeEnv})`);
});
