import type { Readable } from 'node:stream';
import { sanitizeFilename } from '../../utils/transliterate.js';

export class AudioFile {
  constructor(
    public readonly stream: Readable,
    public readonly title: string,
    public readonly duration: number,
    public readonly format: string = 'opus',
  ) {}

  getFileName(): string {
    const sanitized = sanitizeFilename(this.title);
    return `${sanitized}.${this.format}`;
  }

  isWithinDurationLimit(maxDurationSeconds = 43200): boolean {
    // Default 12 hours (enough for audiobooks)
    return this.duration <= maxDurationSeconds;
  }

  getDurationHours(): number {
    return this.duration / 3600;
  }
}
