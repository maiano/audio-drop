import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { AudioFile } from '../../domain/entities/AudioFile.js';
import type { IAudioExtractor } from '../../domain/interfaces/IAudioExtractor.js';
import type { ILogger } from '../../domain/interfaces/ILogger.js';

export class YtDlpExtractor implements IAudioExtractor {
  constructor(private readonly logger: ILogger) {
    this.logVersion();
  }

  private logVersion(): void {
    const ytdlp = spawn('yt-dlp', ['--version']);
    ytdlp.stdout.on('data', (data) => {
      this.logger.info(`yt-dlp version: ${data.toString().trim()}`);
    });
  }

  async extractAudio(url: string): Promise<AudioFile> {
    this.logger.info('Starting audio extraction', { url });

    try {
      const metadata = await this.getVideoMetadata(url);

      const ytdlp = spawn('yt-dlp', [
        '--extract-audio',
        '--audio-format',
        'opus',
        '--audio-quality',
        '32K',
        '--no-playlist',
        '--no-warnings',
        '--no-call-home',
        '--no-check-certificate',
        '--prefer-free-formats',
        '--youtube-skip-dash-manifest',
        '--extractor-args',
        'youtube:player_client=android_embedded,android_creator,android_vr,web_creator',
        '--extractor-args',
        'youtube:skip=dash,hls',
        '--age-limit',
        '0',
        '-o',
        '-',
        url,
      ]);

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

  private async getVideoMetadata(url: string): Promise<{ title: string; duration: number }> {
    return new Promise((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', [
        '--dump-json',
        '--no-warnings',
        '--no-playlist',
        '--skip-download',
        '--extractor-args',
        'youtube:player_client=android_embedded,android_creator,android_vr,web_creator',
        '--extractor-args',
        'youtube:skip=dash,hls',
        '--age-limit',
        '0',
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
          this.logger.error('yt-dlp metadata extraction failed', new Error(errorOutput), {
            url,
            exitCode: code,
          });
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
          this.logger.error('Failed to parse metadata JSON', error, { url });
          reject(new Error('Failed to parse video metadata'));
        }
      });

      ytdlp.on('error', (error) => {
        this.logger.error('yt-dlp process error', error, { url });
        reject(new Error(`Failed to execute yt-dlp: ${error.message}`));
      });
    });
  }

  private parseYtDlpError(errorOutput: string): string {
    if (errorOutput.includes('Private video')) {
      return 'This is a private video. Cannot extract audio.';
    }
    if (errorOutput.includes('age')) {
      return 'Age-restricted video. Cannot extract audio.';
    }
    if (errorOutput.includes('not available')) {
      return 'Video is unavailable or deleted.';
    }
    if (errorOutput.includes('copyright')) {
      return 'Video is blocked due to copyright.';
    }

    return 'Failed to extract audio. Check the link.';
  }
}
