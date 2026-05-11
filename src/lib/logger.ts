// src/lib/logger.ts
// Structured JSON Logger for Next.js Control Plane and Edge Runtimes
// Provides Pino-like interface with zero-dependency execution and full Serverless/Edge safety.

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  FATAL: 50,
};

const CURRENT_LEVEL = (process.env.LOG_LEVEL?.toUpperCase() as LogLevel) || 'INFO';
const CURRENT_LEVEL_NUM = LOG_LEVELS[CURRENT_LEVEL] || 20;

const isProduction = process.env.NODE_ENV === 'production';

// Safe reference to global Sentry (if initialized)
let SentryInstance: any = null;
if (typeof window === 'undefined') {
  // Server-side dynamic Sentry resolution
  try {
    SentryInstance = require('@sentry/nextjs');
  } catch {
    // Sentry not loaded yet
  }
}

// Color helpers for beautiful local dev logs
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function formatDevLog(level: LogLevel, message: string, context?: any) {
  const time = new Date().toLocaleTimeString();
  let levelColor = colors.blue;
  if (level === 'INFO') levelColor = colors.green;
  if (level === 'WARN') levelColor = colors.yellow;
  if (level === 'ERROR') levelColor = colors.red;
  if (level === 'FATAL') levelColor = colors.magenta;

  const ctxStr = context && Object.keys(context).length > 0
    ? ` ${colors.dim}${JSON.stringify(context, null, 2)}${colors.reset}`
    : '';

  return `[${colors.dim}${time}${colors.reset}] ${levelColor}${level.padEnd(5)}${colors.reset}: ${message}${ctxStr}`;
}

function serializeError(err: any): any {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
      ...(err as any),
    };
  }
  return err;
}

function writeLog(level: LogLevel, message: string, context?: any) {
  const levelNum = LOG_LEVELS[level];
  if (levelNum < CURRENT_LEVEL_NUM) return;

  const timestamp = new Date().toISOString();
  
  // Clean up and serialize errors inside context
  let cleanContext = { ...context };
  if (cleanContext.error) {
    cleanContext.error = serializeError(cleanContext.error);
  }
  if (cleanContext.err) {
    cleanContext.error = serializeError(cleanContext.err);
    delete cleanContext.err;
  }

  if (!isProduction) {
    const formatted = formatDevLog(level, message, cleanContext);
    if (levelNum >= 40) {
      console.error(formatted);
    } else if (levelNum === 30) {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
    return;
  }

  // Production JSON payload (NDJSON format)
  const payload = {
    timestamp,
    level,
    service: 'control-plane',
    environment: process.env.NODE_ENV || 'production',
    message,
    ...cleanContext,
  };

  console.log(JSON.stringify(payload));

  // Integrate with Sentry in production for warning, error, and fatal events
  if (levelNum >= 30) {
    try {
      if (SentryInstance) {
        SentryInstance.withScope((scope: any) => {
          // Set custom context attributes as tags
          if (cleanContext.file_id) scope.setTag('file_id', cleanContext.file_id);
          if (cleanContext.account_id) scope.setTag('account_id', cleanContext.account_id);
          if (cleanContext.part_number) scope.setTag('part_number', cleanContext.part_number);
          if (cleanContext.trace_id) scope.setTag('trace_id', cleanContext.trace_id);
          
          if (cleanContext.error) {
            SentryInstance.captureException(cleanContext.error);
          } else {
            SentryInstance.captureMessage(message, level === 'WARN' ? 'warning' : 'error');
          }
        });
      }
    } catch {
      // Sentry send failure should never crash the main application thread
    }
  }
}

export const logger = {
  debug: (message: string, context?: any) => writeLog('DEBUG', message, context),
  info: (message: string, context?: any) => writeLog('INFO', message, context),
  warn: (message: string, context?: any) => writeLog('WARN', message, context),
  error: (message: string, context?: any) => writeLog('ERROR', message, context),
  fatal: (message: string, context?: any) => writeLog('FATAL', message, context),
};
