import pino from 'pino';
import type { ILogger } from '../../domain/interfaces/ILogger.js';

export class PinoLogger implements ILogger {
  private logger: pino.Logger;

  constructor(level = 'info', pretty = false) {
    this.logger = pino({
      level,
      ...(pretty && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
    });
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(context, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context, message);
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorContext = error instanceof Error ? { error: error.message, stack: error.stack } : {};
    this.logger.error({ ...context, ...errorContext }, message);
  }
}
