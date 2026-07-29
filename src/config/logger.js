import { createLogger, format, transports } from 'winston';
import { mkdirSync, existsSync } from 'fs';

const { combine, timestamp, printf, colorize, errors } = format;
const isProd = process.env.NODE_ENV === 'production';

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    // winston always adds these internal symbol-keyed fields — never useful to print
    delete meta[Symbol.for('level')];
    delete meta[Symbol.for('message')];
    delete meta[Symbol.for('splat')];
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
});

const allTransports = [
    new transports.Console({
        format: combine(
            colorize(),
            timestamp({ format: 'HH:mm:ss' }),
            errors({ stack: true }),
            logFormat
        ),
    }),
];

// Only write to disk locally — most hosts (Vercel etc.) are read-only
if (!isProd) {
    if (!existsSync('logs')) mkdirSync('logs');
    allTransports.push(
        new transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 5_242_880, maxFiles: 5 }),
        new transports.File({ filename: 'logs/combined.log', maxsize: 5_242_880, maxFiles: 5 })
    );
}

const logger = createLogger({
    level: isProd ? 'info' : 'debug',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
    ),
    transports: allTransports,
});

export default logger;
