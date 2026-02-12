import type { Readable } from 'node:stream';

/**
 * Domain Entity: AudioFile
 * Представляет извлеченный аудиофайл
 */
export class AudioFile {
  constructor(
    public readonly stream: Readable,
    public readonly title: string,
    public readonly duration: number, // в секундах
    public readonly format: string = 'opus',
  ) {}

  /**
   * Получить название файла
   */
  getFileName(): string {
    // Убираем недопустимые символы из названия
    const sanitized = this.title
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    return `${sanitized}.${this.format}`;
  }

  /**
   * Проверяет, не превышает ли длительность максимальную (2 часа)
   */
  isWithinDurationLimit(maxDurationSeconds = 7200): boolean {
    return this.duration <= maxDurationSeconds;
  }
}
