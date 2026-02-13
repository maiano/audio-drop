export class AudioRequest {
  constructor(
    public readonly url: string,
    public readonly userId: number,
    public readonly messageId: number,
    public readonly chatId: number,
  ) {}

  isYouTubeUrl(): boolean {
    const youtubeRegex =
      /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|v\/|shorts\/)?[\w-]+/;
    return youtubeRegex.test(this.url);
  }

  getVideoId(): string | null {
    const match = this.url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    );
    return match?.[1] ?? null;
  }
}
