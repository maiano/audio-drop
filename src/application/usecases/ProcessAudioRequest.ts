import type { AudioRequest } from '../../domain/entities/AudioRequest.js';
import type { IAudioExtractor } from '../../domain/interfaces/IAudioExtractor.js';
import type { ILogger } from '../../domain/interfaces/ILogger.js';

export interface ProcessAudioRequestResult {
  success: boolean;
  error?: string;
}

export class ProcessAudioRequest {
  constructor(
    private readonly audioExtractor: IAudioExtractor,
    private readonly logger: ILogger,
  ) {}

  async execute(request: AudioRequest): Promise<ProcessAudioRequestResult> {
    try {
      if (!request.isYouTubeUrl()) {
        this.logger.warn('Invalid YouTube URL', { url: request.url, userId: request.userId });
        return {
          success: false,
          error: 'This is not a YouTube link. Please send a YouTube video link.',
        };
      }

      this.logger.info('Processing audio request', {
        userId: request.userId,
        videoId: request.getVideoId(),
      });

      const isAvailable = await this.audioExtractor.isVideoAvailable(request.url);
      if (!isAvailable) {
        return {
          success: false,
          error: 'Video is unavailable. Check the link or try another video.',
        };
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to process audio request', error, {
        userId: request.userId,
        url: request.url,
      });

      const errorMessage =
        error instanceof Error ? error.message : 'An error occurred while processing the request.';

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
