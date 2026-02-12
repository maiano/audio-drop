/**
 * Entry Point: Audio Drop Bot
 * Clean Architecture структура с разделением слоев
 */

import { loadEnv } from './config/env.js';
import { HealthServer } from './infrastructure/http/HealthServer.js';
import { PinoLogger } from './infrastructure/http/PinoLogger.js';
import { TelegramBot } from './infrastructure/telegram/TelegramBot.js';
import { YtDlpExtractor } from './infrastructure/youtube/YtDlpExtractor.js';
import { MessageHandler } from './presentation/telegram/MessageHandler.js';

async function bootstrap() {
  // Загружаем конфигурацию
  const env = loadEnv();

  // Инициализируем логгер
  const logger = new PinoLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');

  logger.info('Starting Audio Drop Bot...', {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    port: env.PORT,
  });

  try {
    // Инициализируем зависимости (Infrastructure layer)
    const audioExtractor = new YtDlpExtractor(logger);
    const telegramBot = new TelegramBot(env.BOT_TOKEN, logger);

    // Инициализируем handlers (Presentation layer)
    const messageHandler = new MessageHandler(telegramBot, audioExtractor, logger);

    // Регистрируем обработчики
    telegramBot.onCommand('start', (ctx) => messageHandler.handleStart(ctx));
    telegramBot.onCommand('help', (ctx) => messageHandler.handleHelp(ctx));
    telegramBot.onText((ctx) => messageHandler.handleMessage(ctx));

    // Запускаем health check сервер (для Render.com)
    const healthServer = new HealthServer(env.PORT, logger);
    await healthServer.start();

    // Запускаем Telegram бота
    await telegramBot.start();
  } catch (error) {
    logger.error('Failed to start application', error);
    process.exit(1);
  }
}

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Запуск приложения
bootstrap();
