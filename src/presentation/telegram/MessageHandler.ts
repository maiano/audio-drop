import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { ProcessAudioRequest } from '../../application/usecases/ProcessAudioRequest.js';
import { AudioRequest } from '../../domain/entities/AudioRequest.js';
import type { AudioCodec, AudioQuality, IAudioExtractor } from '../../domain/interfaces/IAudioExtractor.js';
import type { ILogger } from '../../domain/interfaces/ILogger.js';
import type { TelegramBot } from '../../infrastructure/telegram/TelegramBot.js';
import { optimizeQualityForDuration } from '../../utils/qualityOptimizer.js';

interface UserSession {
  url: string;
  codec: AudioCodec;
}

export class MessageHandler {
  private processAudioUseCase: ProcessAudioRequest;
  private userSessions: Map<number, UserSession> = new Map();

  constructor(
    private readonly bot: TelegramBot,
    private readonly audioExtractor: IAudioExtractor,
    private readonly logger: ILogger,
    private readonly allowedUserIds: number[] = [],
  ) {
    this.processAudioUseCase = new ProcessAudioRequest(audioExtractor, logger);
  }

  private isUserAllowed(userId: number): boolean {
    // If whitelist is empty, allow everyone
    if (this.allowedUserIds.length === 0) {
      return true;
    }
    return this.allowedUserIds.includes(userId);
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
📱 Low - ~64kbps
🔇 Ultra-Low - ~48kbps mono (for very long content)

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
• Ultra-Low - Smallest size (~48kbps mono, for 6+ hour audiobooks)
• Show Formats - View all available audio formats

*Auto-optimization:*
• 1.5-3h: Best/High → Medium
• 3-6h: Best/High/Medium → Low
• 6+h: Any → Ultra-Low (48k mono)

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

    // Check whitelist
    if (!this.isUserAllowed(userId)) {
      this.logger.warn('Unauthorized user attempted access', { userId });
      await ctx.reply(
        '🔒 This is a private bot.\n\nAccess is restricted to authorized users only.\nIf you believe this is an error, please contact the bot owner.',
      );
      return;
    }

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

      // Store session with opus as default
      this.userSessions.set(userId, { url, codec: 'opus' });

      // Show format and quality selection keyboard
      await this.showQualityKeyboard(ctx, userId, 'opus');
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

  private async showQualityKeyboard(ctx: Context, userId: number, selectedCodec: AudioCodec): Promise<void> {
    const opusSelected = selectedCodec === 'opus';
    const m4aSelected = selectedCodec === 'm4a';

    const keyboard = new InlineKeyboard()
      .text(`${opusSelected ? '🤖 Opus ✓' : '🤖 Opus'}`, `codec:opus:${userId}`)
      .text(`${m4aSelected ? '🍎 M4A ✓' : '🍎 M4A (iOS)'}`, `codec:m4a:${userId}`)
      .row()
      .text('🏆 Best', `quality:best:${userId}`)
      .text('⚡ High', `quality:high:${userId}`)
      .row()
      .text('💾 Medium', `quality:medium:${userId}`)
      .text('📱 Low', `quality:low:${userId}`)
      .row()
      .text('🔇 Ultra-Low', `quality:ultralow:${userId}`)
      .row()
      .text('📋 Show Formats', `formats:${userId}`);

    const codecInfo = opusSelected
      ? 'Opus - Better quality, smaller size'
      : 'M4A (AAC) - iOS compatible for download';

    await ctx.reply(`✅ Video found!\n\n📦 Format: ${codecInfo}\n\nChoose quality:`, {
      reply_markup: keyboard,
    });
  }

  async handleCodecCallback(ctx: Context, codec: AudioCodec, userId: number): Promise<void> {
    const session = this.userSessions.get(userId);
    if (!session) {
      await ctx.answerCallbackQuery({ text: '❌ Session expired. Send the link again.' });
      return;
    }

    // Check if codec is already selected
    if (session.codec === codec) {
      await ctx.answerCallbackQuery({ text: `${codec.toUpperCase()} already selected` });
      return;
    }

    // Update codec in session
    session.codec = codec;
    this.userSessions.set(userId, session);

    await ctx.answerCallbackQuery({ text: `Format changed to ${codec.toUpperCase()}` });

    // Update message with new keyboard
    const codecInfo = codec === 'opus' ? 'Opus - Better quality, smaller size' : 'M4A (AAC) - iOS compatible for download';
    try {
      await ctx.editMessageText(`✅ Video found!\n\n📦 Format: ${codecInfo}\n\nChoose quality:`, {
        reply_markup: this.buildQualityKeyboard(userId, codec),
      });
    } catch (error) {
      this.logger.error('Failed to update message', error);
    }
  }

  private buildQualityKeyboard(userId: number, selectedCodec: AudioCodec): InlineKeyboard {
    const opusSelected = selectedCodec === 'opus';
    const m4aSelected = selectedCodec === 'm4a';

    return new InlineKeyboard()
      .text(`${opusSelected ? '🤖 Opus ✓' : '🤖 Opus'}`, `codec:opus:${userId}`)
      .text(`${m4aSelected ? '🍎 M4A ✓' : '🍎 M4A (iOS)'}`, `codec:m4a:${userId}`)
      .row()
      .text('🏆 Best', `quality:best:${userId}`)
      .text('⚡ High', `quality:high:${userId}`)
      .row()
      .text('💾 Medium', `quality:medium:${userId}`)
      .text('📱 Low', `quality:low:${userId}`)
      .row()
      .text('🔇 Ultra-Low', `quality:ultralow:${userId}`)
      .row()
      .text('📋 Show Formats', `formats:${userId}`);
  }

  async handleQualityCallback(ctx: Context, quality: AudioQuality, userId: number): Promise<void> {
    this.logger.info('Quality callback received', { quality, userId });

    const session = this.userSessions.get(userId);
    if (!session) {
      this.logger.warn('Session not found', { userId });
      await ctx.answerCallbackQuery({ text: '❌ Session expired. Send the link again.' });
      return;
    }

    this.logger.info('Session found', { url: session.url, codec: session.codec });

    const chatId = ctx.chat?.id;
    if (!chatId) {
      this.logger.error('Chat ID not found');
      return;
    }

    await ctx.answerCallbackQuery({ text: `⏳ Extracting ${quality} quality...` });

    // Remove keyboard and update text to prevent multiple clicks
    try {
      await ctx.editMessageText('⏳ Checking video metadata...', { reply_markup: undefined });
    } catch (error) {
      this.logger.error('Failed to edit message', error);
    }

    this.bot.startProcessing(userId);

    try {
      // Get metadata first to optimize quality
      const metadata = await this.audioExtractor.getMetadata(session.url);

      // Check duration limit
      const maxDuration = 43200; // 12 hours
      if (metadata.duration > maxDuration) {
        await ctx.editMessageText(
          `❌ Video is too long (${(metadata.duration / 3600).toFixed(1)} hours).\n\nMaximum supported duration is 12 hours.`,
        );
        this.bot.stopProcessing(userId);
        return;
      }

      // Optimize quality for long content
      const optimized = optimizeQualityForDuration(quality, metadata.duration);

      if (optimized.adjusted) {
        this.logger.info('Quality auto-adjusted for duration', {
          userId,
          originalQuality: quality,
          adjustedQuality: optimized.quality,
          durationHours: (metadata.duration / 3600).toFixed(1),
        });

        await ctx.editMessageText(`ℹ️ ${optimized.reason}\n\n⏳ Extracting audio...`);
      } else {
        await ctx.editMessageText('⏳ Extracting audio... This may take some time.');
      }

      await this.bot.sendChatAction(chatId, 'upload_document');
      const audioFile = await this.audioExtractor.extractAudio(session.url, optimized.quality, session.codec);

      await this.bot.sendChatAction(chatId, 'upload_document');
      await this.bot.sendAudio(chatId, audioFile.stream, audioFile.getFileName(), {
        title: audioFile.title,
        duration: audioFile.duration,
      });

      this.logger.info('Audio sent successfully', {
        userId,
        quality,
        duration: audioFile.duration,
      });

      await ctx.editMessageText('✅ Done! Enjoy listening 🎧');
      this.userSessions.delete(userId);
    } catch (error) {
      this.logger.error('Failed to extract audio', error, { userId, url: session.url, quality });

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
    const session = this.userSessions.get(userId);
    if (!session) {
      await ctx.answerCallbackQuery({ text: '❌ Session expired. Send the link again.' });
      return;
    }

    await ctx.answerCallbackQuery({ text: '🔍 Fetching formats...' });

    try {
      const formats = await this.audioExtractor.getAvailableFormats(session.url);

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
      this.logger.error('Failed to get formats', error, { userId, url: session.url });
      await ctx.reply('❌ Failed to get available formats.');
    }
  }
}
