import type { AudioFile } from '../entities/AudioFile.js';

export type AudioQuality = 'best' | 'high' | 'medium' | 'low';

export interface AudioFormat {
  formatId: string;
  ext: string;
  quality: string;
  size?: string;
  bitrate?: string;
}

export interface IAudioExtractor {
  extractAudio(url: string, quality?: AudioQuality): Promise<AudioFile>;
  isVideoAvailable(url: string): Promise<boolean>;
  getAvailableFormats(url: string): Promise<AudioFormat[]>;
}
