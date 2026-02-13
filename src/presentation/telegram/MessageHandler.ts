import type { Context } from 'grammy';
import { ProcessAudioRequest } from '../../application/usecases/ProcessAudioRequest.js';
import { AudioRequest } from '../../domain/entities/AudioRequest.js';
import type { IAudioExtractor } from '../../domain/interfaces/IAudioExtractor.js';
import type { ILogger } from '../../domain/interfaces/ILogger.js';
import type { TelegramBot } from '../../infrastructure/telegram/TelegramBot.js';

export class MessageHandler {
  private processAudioUseCase: ProcessAudioRequest;

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

Hi! I'll help you extract audio from YouTube videos.

*How to use:*
Just send me a YouTube video link, and I'll return an audio file.

*Supported formats:*
• youtube.com/watch?v=...
• youtu.be/...
• youtube.com/shorts/...

*Limitations:*
• Maximum duration: 2 hours
• Public videos only
• Format: Opus (optimized for speech)

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
4. Receive the audio file

*Example links:*
• \`https://youtube.com/watch?v=dQw4w9WgXcQ\`
• \`https://youtu.be/dQw4w9WgXcQ\`
• \`https://youtube.com/shorts/abc123\`

*Common issues:*
• "Video unavailable" - video is private or deleted
• "Duration exceeded" - video is longer than 2 hours
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
        return;
      }

      await this.bot.sendChatAction(chatId, 'upload_voice');
      await ctx.reply('⏳ Extracting audio... This may take some time.');

      const audioFile = await this.audioExtractor.extractAudio(url);

      if (!audioFile.isWithinDurationLimit()) {
        await ctx.reply('❌ Video is too long (over 2 hours).\n\nTry a shorter video.');
        return;
      }

      await this.bot.sendChatAction(chatId, 'upload_voice');
      await this.bot.sendAudio(chatId, audioFile.stream, audioFile.getFileName());

      this.logger.info('Audio sent successfully', {
        userId,
        videoId: request.getVideoId(),
        duration: audioFile.duration,
      });

      await ctx.reply('✅ Done! Enjoy listening 🎧');
    } catch (error) {
      this.logger.error('Failed to process message', error, { userId, url });

      const errorMessage =
        error instanceof Error
          ? error.message
          : '❌ An error occurred while extracting audio.\n\nTry again later or with another video.';

      await ctx.reply(errorMessage);
    } finally {
      this.bot.stopProcessing(userId);
    }
  }
}
