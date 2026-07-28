import morgan from 'morgan';
import logger from '../config/logger.js';
import { config } from '../config/env.js';

const stream = {
    write: (message) => logger.http(message.trim()),
};

export const requestLogger = morgan(
    config.isProd ? 'combined' : 'dev',
    { stream }
);
