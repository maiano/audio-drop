import type { AudioFile } from '../entities/AudioFile.js';

export interface IAudioExtractor {
  extractAudio(url: string): Promise<AudioFile>;
  isVideoAvailable(url: string): Promise<boolean>;
}
