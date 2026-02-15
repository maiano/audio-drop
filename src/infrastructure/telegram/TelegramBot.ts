import type { Readable } from 'node:stream';
import { Bot, type Context, InputFile } from 'grammy';
import type { ILogger } from '../../domain/interfaces/ILogger.js';

export class TelegramBot {
  private bot: Bot;
  private processingUsers = new Set<number>();

  constructor(
    token: string,
    private readonly logger: ILogger,
  ) {
    this.bot = new Bot(token);
  }

  onCommand(command: string, handler: (ctx: Context) => Promise<void>): void {
    this.bot.command(command, async (ctx) => {
      try {
        await handler(ctx);
      } catch (error) {
        this.logger.error(`Error handling command: ${command}`, error);
        await ctx.reply('An error occurred. Please try again later.');
      }
    });
  }

  onText(handler: (ctx: Context) => Promise<void>): void {
    this.bot.on('message:text', async (ctx) => {
      try {
        await handler(ctx);
      } catch (error) {
        this.logger.error('Error handling text message', error);
        await ctx.reply('An error occurred. Please try again later.');
      }
    });
  }

  onCallbackQuery(pattern: RegExp, handler: (ctx: Context) => Promise<void>): void {
    this.bot.on('callback_query:data', async (ctx) => {
      try {
        if (pattern.test(ctx.callbackQuery.data)) {
          await handler(ctx);
        }
      } catch (error) {
        this.logger.error('Error handling callback query', error);
        await ctx.answerCallbackQuery({ text: 'An error occurred. Please try again.' });
      }
    });
  }

  isUserProcessing(userId: number): boolean {
    return this.processingUsers.has(userId);
  }

  startProcessing(userId: number): void {
    this.processingUsers.add(userId);
  }

  stopProcessing(userId: number): void {
    this.processingUsers.delete(userId);
  }

  async sendAudio(
    chatId: number,
    stream: Readable,
    filename: string,
    options?: { title?: string; duration?: number },
  ): Promise<void> {
    await this.bot.api.sendAudio(chatId, new InputFile(stream, filename), {
      title: options?.title || filename.replace(/\.[^.]+$/, ''),
      performer: 'YouTube',
      duration: options?.duration,
      caption: '🎵 Audio extracted',
    });
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, text);
  }

  async sendChatAction(chatId: number, action: 'upload_voice' | 'typing'): Promise<void> {
    await this.bot.api.sendChatAction(chatId, action);
  }

  async start(): Promise<void> {
    this.logger.info('Starting Telegram bot...');

    process.once('SIGINT', () => this.stop('SIGINT'));
    process.once('SIGTERM', () => this.stop('SIGTERM'));

    await this.bot.start({
      onStart: (botInfo) => {
        this.logger.info('Bot started successfully', {
          username: botInfo.username,
          id: botInfo.id,
        });
      },
    });
  }

  private async stop(signal: string): Promise<void> {
    this.logger.info(`Received ${signal}, stopping bot...`);
    await this.bot.stop();
    this.logger.info('Bot stopped gracefully');
    process.exit(0);
  }

  getBot(): Bot {
    return this.bot;
  }
}
