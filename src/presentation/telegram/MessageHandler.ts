import type { Context } from 'grammy';
import { ProcessAudioRequest } from '../../application/usecases/ProcessAudioRequest.js';
import { AudioRequest } from '../../domain/entities/AudioRequest.js';
import type { IAudioExtractor } from '../../domain/interfaces/IAudioExtractor.js';
import type { ILogger } from '../../domain/interfaces/ILogger.js';
import type { TelegramBot } from '../../infrastructure/telegram/TelegramBot.js';

/**
 * Presentation: Telegram Message Handler
 * Обрабатывает входящие сообщения с YouTube ссылками
 */
export class MessageHandler {
  private processAudioUseCase: ProcessAudioRequest;

  constructor(
    private readonly bot: TelegramBot,
    private readonly audioExtractor: IAudioExtractor,
    private readonly logger: ILogger,
  ) {
    this.processAudioUseCase = new ProcessAudioRequest(audioExtractor, logger);
  }

  /**
   * Обрабатывает команду /start
   */
  async handleStart(ctx: Context): Promise<void> {
    const welcomeMessage = `
🎵 *Audio Drop Bot*

Привет! Я помогу извлечь аудио из YouTube видео.

*Как использовать:*
Просто отправь мне ссылку на YouTube видео, и я верну аудиофайл.

*Поддерживаемые форматы:*
• youtube.com/watch?v=...
• youtu.be/...
• youtube.com/shorts/...

*Ограничения:*
• Максимальная длительность: 2 часа
• Только публичные видео
• Формат: Opus (оптимизирован для речи)

Отправь ссылку, чтобы начать! 🚀
    `.trim();

    await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
  }

  /**
   * Обрабатывает команду /help
   */
  async handleHelp(ctx: Context): Promise<void> {
    const helpMessage = `
*Помощь*

*Как использовать бота:*
1. Найди нужное видео на YouTube
2. Скопируй ссылку на видео
3. Отправь ссылку мне
4. Получи аудиофайл

*Примеры ссылок:*
• \`https://youtube.com/watch?v=dQw4w9WgXcQ\`
• \`https://youtu.be/dQw4w9WgXcQ\`
• \`https://youtube.com/shorts/abc123\`

*Частые проблемы:*
• "Видео недоступно" - видео приватное или удалено
• "Превышена длительность" - видео длиннее 2 часов
• "Попробуйте позже" - бот временно перегружен

По вопросам: создайте issue на GitHub
    `.trim();

    await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
  }

  /**
   * Обрабатывает текстовые сообщения (ссылки на YouTube)
   */
  async handleMessage(ctx: Context): Promise<void> {
    if (!ctx.message?.text || !ctx.from || !ctx.chat) {
      return;
    }

    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const url = ctx.message.text.trim();

    // Проверка на одновременную обработку
    if (this.bot.isUserProcessing(userId)) {
      await ctx.reply('⏳ Я еще обрабатываю ваш предыдущий запрос. Подождите немного...');
      return;
    }

    // Создаем запрос
    const request = new AudioRequest(url, userId, ctx.message.message_id, chatId);

    // Быстрая проверка на YouTube URL
    if (!request.isYouTubeUrl()) {
      await ctx.reply('❌ Это не YouTube ссылка.\n\nОтправьте ссылку на видео с YouTube.');
      return;
    }

    // Помечаем пользователя как обрабатываемого
    this.bot.startProcessing(userId);

    try {
      // Показываем индикатор загрузки
      await this.bot.sendChatAction(chatId, 'typing');
      await ctx.reply('🔍 Проверяю видео...');

      // Валидация через use case
      const validationResult = await this.processAudioUseCase.execute(request);

      if (!validationResult.success) {
        await ctx.reply(`❌ ${validationResult.error}`);
        return;
      }

      // Извлекаем аудио
      await this.bot.sendChatAction(chatId, 'upload_voice');
      await ctx.reply('⏳ Извлекаю аудио... Это может занять некоторое время.');

      const audioFile = await this.audioExtractor.extractAudio(url);

      // Проверка длительности
      if (!audioFile.isWithinDurationLimit()) {
        await ctx.reply('❌ Видео слишком длинное (больше 2 часов).\n\nПопробуйте видео покороче.');
        return;
      }

      // Отправляем аудиофайл
      await this.bot.sendChatAction(chatId, 'upload_voice');
      await this.bot.sendAudio(chatId, audioFile.stream, audioFile.getFileName());

      this.logger.info('Audio sent successfully', {
        userId,
        videoId: request.getVideoId(),
        duration: audioFile.duration,
      });

      await ctx.reply('✅ Готово! Приятного прослушивания 🎧');
    } catch (error) {
      this.logger.error('Failed to process message', error, { userId, url });

      const errorMessage =
        error instanceof Error
          ? error.message
          : '❌ Произошла ошибка при извлечении аудио.\n\nПопробуйте позже или другое видео.';

      await ctx.reply(errorMessage);
    } finally {
      // Снимаем отметку об обработке
      this.bot.stopProcessing(userId);
    }
  }
}
