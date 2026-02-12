import type { AudioRequest } from '../../domain/entities/AudioRequest.js';
import type { IAudioExtractor } from '../../domain/interfaces/IAudioExtractor.js';
import type { ILogger } from '../../domain/interfaces/ILogger.js';

export interface ProcessAudioRequestResult {
  success: boolean;
  error?: string;
}

/**
 * Application Use Case: Process Audio Request
 * Бизнес-логика обработки запроса на извлечение аудио
 */
export class ProcessAudioRequest {
  constructor(
    private readonly audioExtractor: IAudioExtractor,
    private readonly logger: ILogger,
  ) {}

  async execute(request: AudioRequest): Promise<ProcessAudioRequestResult> {
    try {
      // Валидация YouTube URL
      if (!request.isYouTubeUrl()) {
        this.logger.warn('Invalid YouTube URL', { url: request.url, userId: request.userId });
        return {
          success: false,
          error: 'Это не YouTube ссылка. Отправьте ссылку на видео с YouTube.',
        };
      }

      this.logger.info('Processing audio request', {
        userId: request.userId,
        videoId: request.getVideoId(),
      });

      // Проверка доступности видео
      const isAvailable = await this.audioExtractor.isVideoAvailable(request.url);
      if (!isAvailable) {
        return {
          success: false,
          error: 'Видео недоступно. Проверьте ссылку или попробуйте другое видео.',
        };
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to process audio request', error, {
        userId: request.userId,
        url: request.url,
      });

      const errorMessage =
        error instanceof Error ? error.message : 'Произошла ошибка при обработке запроса.';

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
