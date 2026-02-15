import type { AudioQuality } from '../domain/interfaces/IAudioExtractor.js';

export function optimizeQualityForDuration(
  requestedQuality: AudioQuality,
  durationSeconds: number,
): { quality: AudioQuality; adjusted: boolean; reason?: string } {
  const hours = durationSeconds / 3600;

  // For extremely long content (6+ hours), force ultra-low quality (48k mono is fine for speech)
  if (hours >= 6) {
    if (requestedQuality !== 'ultralow') {
      return {
        quality: 'ultralow',
        adjusted: true,
        reason: `Auto-adjusted to Ultra-Low quality for ${hours.toFixed(1)}h duration (48kbps mono is optimal for very long audiobooks)`,
      };
    }
  }

  // For very long content (3-6 hours), force low quality (64k is fine for voice)
  if (hours >= 3 && hours < 6) {
    if (requestedQuality === 'best' || requestedQuality === 'high' || requestedQuality === 'medium') {
      return {
        quality: 'low',
        adjusted: true,
        reason: `Auto-adjusted to Low quality for ${hours.toFixed(1)}h duration (64kbps is optimal for long audiobooks/podcasts)`,
      };
    }
  }

  // For long content (1.5-3 hours), recommend medium quality
  if (hours >= 1.5 && hours < 3) {
    if (requestedQuality === 'best' || requestedQuality === 'high') {
      return {
        quality: 'medium',
        adjusted: true,
        reason: `Auto-adjusted to Medium quality for ${hours.toFixed(1)}h duration (good balance of quality/size)`,
      };
    }
  }

  return { quality: requestedQuality, adjusted: false };
}
