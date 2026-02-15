import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { ProcessAudioRequest } from '../../application/usecases/ProcessAudioRequest.js';
import { AudioRequest } from '../../domain/entities/AudioRequest.js';
import type { AudioQuality, IAudioExtractor } from '../../domain/interfaces/IAudioExtractor.js';
import type { ILogger } from '../../domain/interfaces/ILogger.js';
import type { TelegramBot } from '../../infrastructure/telegram/TelegramBot.js';

export class MessageHandler {
  private processAudioUseCase: ProcessAudioRequest;
  private userUrls: Map<number, string> = new Map();

  constructor(
    private readonly bot: TelegramBot,
    private readonly audioExtractor: IAudioExtractor,
    private readonly logger: ILogger,
  ) {
    this.processAudioUseCase = new ProcessAudioRequest(audioExtractor, logger);
  }

  async handleStart(ctx: Context): Promise<void> {
    const welcomeMessage = `
🎵 *Audio Drop Bot*

Hi! I'll help you extract audio from YouTube videos with quality selection.

*How to use:*
1. Send me a YouTube video link
2. Choose audio quality (Best, High, Medium, Low)
3. Receive your audio file

*Supported formats:*
• youtube.com/watch?v=...
• youtu.be/...
• youtube.com/shorts/...

*Quality options:*
🏆 Best - Highest available quality
⚡ High - ~192kbps
💾 Medium - ~128kbps
📱 Low - ~64kbps (smaller file)

Send a link to get started! 🚀
    `.trim();

    await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
  }

  async handleHelp(ctx: Context): Promise<void> {
    const helpMessage = `
*Help*

*How to use the bot:*
1. Find the video on YouTube
2. Copy the video link
3. Send the link to me
4. Choose quality from buttons
5. Receive the audio file

*Example links:*
• \`https://youtube.com/watch?v=dQw4w9WgXcQ\`
• \`https://youtu.be/dQw4w9WgXcQ\`
• \`https://youtube.com/shorts/abc123\`

*Quality guide:*
• Best - Maximum quality (larger file)
• High - Good balance (~192kbps)
• Medium - Smaller size (~128kbps)
• Low - Minimum size (~64kbps)
• Show Formats - View all available audio formats

*Common issues:*
• "Video unavailable" - video is private or deleted
• "Session expired" - send the link again
• "Try later" - bot is temporarily overloaded

For questions: create an issue on GitHub
    `.trim();

    await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
  }

  async handleMessage(ctx: Context): Promise<void> {
    if (!ctx.message?.text || !ctx.from || !ctx.chat) {
      return;
    }

    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const url = ctx.message.text.trim();

    if (this.bot.isUserProcessing(userId)) {
      await ctx.reply('⏳ I am still processing your previous request. Please wait...');
      return;
    }

    const request = new AudioRequest(url, userId, ctx.message.message_id, chatId);

    if (!request.isYouTubeUrl()) {
      await ctx.reply('❌ This is not a YouTube link.\n\nPlease send a YouTube video link.');
      return;
    }

    this.bot.startProcessing(userId);

    try {
      await this.bot.sendChatAction(chatId, 'typing');
      await ctx.reply('🔍 Checking video...');

      const validationResult = await this.processAudioUseCase.execute(request);

      if (!validationResult.success) {
        await ctx.reply(`❌ ${validationResult.error}`);
        this.bot.stopProcessing(userId);
        return;
      }

      // Store URL for quality selection
      this.userUrls.set(userId, url);

      // Show quality selection keyboard
      const keyboard = new InlineKeyboard()
        .text('🏆 Best Quality', `quality:best:${userId}`)
        .text('⚡ High (192k)', `quality:high:${userId}`)
        .row()
        .text('💾 Medium (128k)', `quality:medium:${userId}`)
        .text('📱 Low (64k)', `quality:low:${userId}`)
        .row()
        .text('📋 Show Formats', `formats:${userId}`);

      await ctx.reply('✅ Video found! Choose audio quality:', { reply_markup: keyboard });
      this.bot.stopProcessing(userId);
    } catch (error) {
      this.logger.error('Failed to process message', error, { userId, url });

      const errorMessage =
        error instanceof Error
          ? error.message
          : '❌ An error occurred while extracting audio.\n\nTry again later or with another video.';

      await ctx.reply(errorMessage);
      this.bot.stopProcessing(userId);
    }
  }

  async handleQualityCallback(ctx: Context, quality: AudioQuality, userId: number): Promise<void> {
    const url = this.userUrls.get(userId);
    if (!url) {
      await ctx.answerCallbackQuery({ text: '❌ Session expired. Send the link again.' });
      return;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) return;

    await ctx.answerCallbackQuery({ text: `⏳ Extracting ${quality} quality...` });

    this.bot.startProcessing(userId);

    try {
      await this.bot.sendChatAction(chatId, 'upload_voice');
      await ctx.editMessageText('⏳ Extracting audio... This may take some time.');

      const audioFile = await this.audioExtractor.extractAudio(url, quality);

      if (!audioFile.isWithinDurationLimit()) {
        await ctx.editMessageText('❌ Video is too long (over 2 hours).\n\nTry a shorter video.');
        return;
      }

      await this.bot.sendChatAction(chatId, 'upload_voice');
      await this.bot.sendAudio(chatId, audioFile.stream, audioFile.getFileName());

      this.logger.info('Audio sent successfully', {
        userId,
        quality,
        duration: audioFile.duration,
      });

      await ctx.editMessageText('✅ Done! Enjoy listening 🎧');
      this.userUrls.delete(userId);
    } catch (error) {
      this.logger.error('Failed to extract audio', error, { userId, url, quality });

      const errorMessage =
        error instanceof Error
          ? error.message
          : '❌ An error occurred while extracting audio.\n\nTry again later or with another video.';

      await ctx.editMessageText(errorMessage);
    } finally {
      this.bot.stopProcessing(userId);
    }
  }

  async handleFormatsCallback(ctx: Context, userId: number): Promise<void> {
    const url = this.userUrls.get(userId);
    if (!url) {
      await ctx.answerCallbackQuery({ text: '❌ Session expired. Send the link again.' });
      return;
    }

    await ctx.answerCallbackQuery({ text: '🔍 Fetching formats...' });

    try {
      const formats = await this.audioExtractor.getAvailableFormats(url);

      if (formats.length === 0) {
        await ctx.reply('❌ No audio formats found.');
        return;
      }

      let message = '📋 *Available Audio Formats:*\n\n';
      for (const fmt of formats) {
        message += `• ${fmt.ext} - ${fmt.bitrate || 'unknown bitrate'}\n`;
      }
      message += '\nUse quality buttons above to download.';

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error('Failed to get formats', error, { userId, url });
      await ctx.reply('❌ Failed to get available formats.');
    }
  }
}
