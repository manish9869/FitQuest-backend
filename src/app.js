import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import logger from './config/logger.js';
import { corsMiddleware, helmetMiddleware, compressionMiddleware, globalLimiter } from './middleware/security.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import dataRoutes from './routes/data.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import llmRoutes from './routes/llm.routes.js';
import gamificationRoutes from './routes/gamification.routes.js';
import automationsRoutes from './routes/automations.routes.js';

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
app.use('/api/data', dataRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/automations', automationsRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
    logger.info(`FitQuest backend listening on port ${config.port} (${config.nodeEnv})`);
});
