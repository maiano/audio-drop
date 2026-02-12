/**
 * Domain Entity: AudioRequest
 * Представляет запрос на извлечение аудио из видео
 */
export class AudioRequest {
  constructor(
    public readonly url: string,
    public readonly userId: number,
    public readonly messageId: number,
    public readonly chatId: number,
  ) {}

  /**
   * Проверяет, является ли URL YouTube ссылкой
   */
  isYouTubeUrl(): boolean {
    const youtubeRegex =
      /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|v\/|shorts\/)?[\w-]+/;
    return youtubeRegex.test(this.url);
  }

  /**
   * Извлекает video ID из YouTube URL
   */
  getVideoId(): string | null {
    const match = this.url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    );
    return match?.[1] ?? null;
  }
}
