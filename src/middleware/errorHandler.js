import logger from '../config/logger.js';
import { config } from '../config/env.js';

export function notFound(req, res) {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
    const status = err.status || err.statusCode || 500;

    logger.error(`${status} — ${err.message}`, {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        stack: err.stack,
    });

    res.status(status).json({
        error: err.message || 'Internal server error',
        ...(config.isProd ? {} : { stack: err.stack }),
    });
}
