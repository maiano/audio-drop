import { loadEnv } from './config/env.js';
import { HealthServer } from './infrastructure/http/HealthServer.js';
import { PinoLogger } from './infrastructure/http/PinoLogger.js';
import { TelegramBot } from './infrastructure/telegram/TelegramBot.js';
import { YtDlpExtractor } from './infrastructure/youtube/YtDlpExtractor.js';
import { MessageHandler } from './presentation/telegram/MessageHandler.js';

async function bootstrap() {
  const env = loadEnv();
  const logger = new PinoLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');

  logger.info('Starting Audio Drop Bot...', {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    port: env.PORT,
  });

  try {
    const audioExtractor = new YtDlpExtractor(
      logger,
      env.PROXY_URL,
      env.YOUTUBE_COOKIES,
      env.YOUTUBE_PO_TOKEN,
    );
    const telegramBot = new TelegramBot(env.BOT_TOKEN, logger);
    const messageHandler = new MessageHandler(telegramBot, audioExtractor, logger, env.ALLOWED_USER_IDS);

    telegramBot.onCommand('start', (ctx) => messageHandler.handleStart(ctx));
    telegramBot.onCommand('help', (ctx) => messageHandler.handleHelp(ctx));
    telegramBot.onText((ctx) => messageHandler.handleMessage(ctx));

    // Handle quality selection callbacks
    telegramBot.onCallbackQuery(/^quality:(best|high|medium|low):(\d+)$/, async (ctx) => {
      const match = ctx.callbackQuery?.data?.match(/^quality:(best|high|medium|low):(\d+)$/);
      if (match) {
        const quality = match[1] as 'best' | 'high' | 'medium' | 'low';
        const userId = Number.parseInt(match[2], 10);
        await messageHandler.handleQualityCallback(ctx, quality, userId);
      }
    });

    // Handle formats list callback
    telegramBot.onCallbackQuery(/^formats:(\d+)$/, async (ctx) => {
      const match = ctx.callbackQuery?.data?.match(/^formats:(\d+)$/);
      if (match) {
        const userId = Number.parseInt(match[1], 10);
        await messageHandler.handleFormatsCallback(ctx, userId);
      }
    });

    const healthServer = new HealthServer(env.PORT, logger);
    await healthServer.start();
    await telegramBot.start();
  } catch (error) {
    logger.error('Failed to start application', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

bootstrap();
