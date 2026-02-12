import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { AudioFile } from '../../domain/entities/AudioFile.js';
import type { IAudioExtractor } from '../../domain/interfaces/IAudioExtractor.js';
import type { ILogger } from '../../domain/interfaces/ILogger.js';

/**
 * Infrastructure: YouTube Audio Extractor
 * Использует yt-dlp для извлечения аудио
 */
export class YtDlpExtractor implements IAudioExtractor {
  constructor(private readonly logger: ILogger) {}

  async extractAudio(url: string): Promise<AudioFile> {
    this.logger.info('Starting audio extraction', { url });

    try {
      // Сначала получаем метаданные
      const metadata = await this.getVideoMetadata(url);

      // Запускаем yt-dlp для извлечения аудио
      const ytdlp = spawn('yt-dlp', [
        '--extract-audio',
        '--audio-format',
        'opus',
        '--audio-quality',
        '32K', // Оптимально для речи
        '--no-playlist', // Не скачивать плейлисты
        '--no-warnings',
        '--no-call-home',
        '--no-check-certificate',
        '--prefer-free-formats',
        '--youtube-skip-dash-manifest',
        '-o',
        '-', // Вывод в stdout
        url,
      ]);

      // Обработка ошибок
      let errorOutput = '';
      ytdlp.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ytdlp.on('error', (error) => {
        this.logger.error('yt-dlp process error', error);
        throw new Error(`Failed to start yt-dlp: ${error.message}`);
      });

      ytdlp.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          this.logger.error('yt-dlp exited with error', new Error(errorOutput));
        }
      });

      return new AudioFile(ytdlp.stdout as Readable, metadata.title, metadata.duration, 'opus');
    } catch (error) {
      this.logger.error('Audio extraction failed', error);
      throw error;
    }
  }

  async isVideoAvailable(url: string): Promise<boolean> {
    try {
      await this.getVideoMetadata(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Получает метаданные видео через yt-dlp
   */
  private async getVideoMetadata(url: string): Promise<{ title: string; duration: number }> {
    return new Promise((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', [
        '--dump-json',
        '--no-warnings',
        '--no-playlist',
        '--skip-download',
        url,
      ]);

      let output = '';
      let errorOutput = '';

      ytdlp.stdout.on('data', (data) => {
        output += data.toString();
      });

      ytdlp.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ytdlp.on('close', (code) => {
        if (code !== 0) {
          const errorMessage = this.parseYtDlpError(errorOutput);
          reject(new Error(errorMessage));
          return;
        }

        try {
          const metadata = JSON.parse(output);
          resolve({
            title: metadata.title || 'Unknown',
            duration: metadata.duration || 0,
          });
        } catch (error) {
          reject(new Error('Failed to parse video metadata'));
        }
      });

      ytdlp.on('error', (error) => {
        reject(new Error(`Failed to execute yt-dlp: ${error.message}`));
      });
    });
  }

  /**
   * Парсит ошибки yt-dlp для понятных сообщений
   */
  private parseYtDlpError(errorOutput: string): string {
    if (errorOutput.includes('Private video')) {
      return 'Это приватное видео. Невозможно извлечь аудио.';
    }
    if (errorOutput.includes('age')) {
      return 'Видео с возрастными ограничениями. Невозможно извлечь аудио.';
    }
    if (errorOutput.includes('not available')) {
      return 'Видео недоступно или удалено.';
    }
    if (errorOutput.includes('copyright')) {
      return 'Видео заблокировано из-за авторских прав.';
    }

    return 'Не удалось извлечь аудио. Проверьте ссылку.';
  }
}
