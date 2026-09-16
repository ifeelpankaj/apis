import * as path from 'path';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { utilities as nestWinstonUtilities } from 'nest-winston';

const isProduction = process.env.NODE_ENV === 'prod';

const rootDir = process.cwd();
const logDir = path.resolve(rootDir, process.env.LOG_DIR || 'logs');

const PRODUCTION_CONSOLE_CONTEXTS = [
  'Bootstrap',
  'Database',
  'DatabaseModule',
  'ConfigValidation',
  'NestFactory',
  'NestApplication',
];

/**
 * File log format.
 *
 * Example:
 * {
 *   "@timestamp": "2026-09-15T07:30:12.123Z",
 *   "level": "info",
 *   "message": "Application started",
 *   "context": "Bootstrap"
 * }
 */
const productionFormat = winston.format.printf(
  ({
    timestamp,
    level,
    message,
    context,
    trace,
    stack,
    error,
    ...metadata
  }) => {
    const logObject: Record<string, unknown> = {
      '@timestamp': timestamp,
      level,
      message,
      context: context || 'Application',
    };

    if (error) {
      logObject.error = error;
    }

    if (trace) {
      logObject.trace = trace;
    }

    if (stack) {
      logObject.stack = stack;
    }

    if (Object.keys(metadata).length > 0) {
      logObject.metadata = metadata;
    }

    return JSON.stringify(logObject);
  },
);

/**
 * Production console format.
 *
 * Only startup/system-related logs are shown.
 * Request/application logs are written to files.
 */
const productionConsoleFormat = winston.format.combine(
  winston.format.colorize(),

  winston.format((info) => {
    const context = String(info.context || 'Application');

    return PRODUCTION_CONSOLE_CONTEXTS.includes(context) ? info : false;
  })(),

  winston.format.printf(({ level, message, context }) => {
    const ctx = context || 'Application';

    return `[${ctx}] ${message}`;
  }),
);

/**
 * Console transport
 */
const consoleTransport = new winston.transports.Console({
  level: isProduction ? 'info' : 'debug',

  format: isProduction
    ? productionConsoleFormat
    : winston.format.combine(
        winston.format.colorize(),
        nestWinstonUtilities.format.nestLike('CabAPI', {
          prettyPrint: true,
          colors: true,
        }),
      ),
});

/**
 * Common format for file transports.
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({
    stack: true,
  }),
);

/**
 * Info / debug / warn logs.
 *
 * Error logs are explicitly excluded.
 */
const fileInfoTransport = new winston.transports.DailyRotateFile({
  dirname: logDir,
  filename: 'info-%DATE%.log',

  level: 'info',

  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,

  maxSize: '20m',
  maxFiles: '30d',

  format: winston.format.combine(
    fileFormat,

    winston.format((info) => {
      return info.level === 'error' ? false : info;
    })(),

    productionFormat,
  ),
});

/**
 * Error logs only.
 */
const fileErrorTransport = new winston.transports.DailyRotateFile({
  dirname: logDir,
  filename: 'error-%DATE%.log',

  level: 'error',

  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,

  maxSize: '20m',
  maxFiles: '45d',

  format: winston.format.combine(fileFormat, productionFormat),
});

export const loggerTransports: winston.transport[] = [
  consoleTransport,
  fileInfoTransport,
  fileErrorTransport,
];

export const loggerConfig: winston.LoggerOptions = {
  level: isProduction ? 'info' : 'debug',

  transports: loggerTransports,

  exceptionHandlers: [fileErrorTransport],

  rejectionHandlers: [fileErrorTransport],
};
