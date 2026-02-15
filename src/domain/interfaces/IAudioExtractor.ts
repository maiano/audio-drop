import type { AudioFile } from '../entities/AudioFile.js';

export type AudioQuality = 'best' | 'high' | 'medium' | 'low' | 'ultralow';
export type AudioCodec = 'opus' | 'm4a';

export interface AudioFormat {
  formatId: string;
  ext: string;
  quality: string;
  size?: string;
  bitrate?: string;
}

export interface VideoMetadata {
  title: string;
  duration: number;
}

export interface IAudioExtractor {
  extractAudio(url: string, quality?: AudioQuality, codec?: AudioCodec): Promise<AudioFile>;
  isVideoAvailable(url: string): Promise<boolean>;
  getAvailableFormats(url: string): Promise<AudioFormat[]>;
  getMetadata(url: string): Promise<VideoMetadata>;
}
