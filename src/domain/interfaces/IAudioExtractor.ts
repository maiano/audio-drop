import type { AudioFile } from '../entities/AudioFile.js';

/**
 * Interface: Audio Extractor
 * Определяет контракт для извлечения аудио из видео
 */
export interface IAudioExtractor {
  /**
   * Извлекает аудио из URL
   * @throws {Error} если извлечение не удалось
   */
  extractAudio(url: string): Promise<AudioFile>;

  /**
   * Проверяет доступность видео
   */
  isVideoAvailable(url: string): Promise<boolean>;
}
