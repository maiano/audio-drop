import type { Readable } from 'node:stream';

export class AudioFile {
  constructor(
    public readonly stream: Readable,
    public readonly title: string,
    public readonly duration: number,
    public readonly format: string = 'opus',
  ) {}

  getFileName(): string {
    const sanitized = this.title
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    return `${sanitized}.${this.format}`;
  }

  isWithinDurationLimit(maxDurationSeconds = 7200): boolean {
    return this.duration <= maxDurationSeconds;
  }
}
