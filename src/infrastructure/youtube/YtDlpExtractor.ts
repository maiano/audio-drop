import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { AudioFile } from '../../domain/entities/AudioFile.js';
import type { AudioFormat, AudioQuality, IAudioExtractor } from '../../domain/interfaces/IAudioExtractor.js';
import type { ILogger } from '../../domain/interfaces/ILogger.js';

export class YtDlpExtractor implements IAudioExtractor {
  private cookiesPath?: string;

  constructor(
    private readonly logger: ILogger,
    private readonly proxyUrl?: string,
    youtubeCookies?: string,
    private readonly poToken?: string,
  ) {
    if (proxyUrl) {
      this.logger.info('Proxy configured');
    }

    if (youtubeCookies) {
      this.cookiesPath = '/tmp/youtube_cookies.txt';
      writeFileSync(this.cookiesPath, youtubeCookies);
      this.logger.info('Cookies configured');
    }

    if (poToken) {
      this.logger.info('PO Token configured');
    }
  }

  async extractAudio(url: string, quality: AudioQuality = 'best'): Promise<AudioFile> {
    this.logger.info('Starting audio extraction', { url, quality });

    try {
      const metadata = await this.getVideoMetadata(url);

      const args = [
        '--extract-audio',
        '--audio-format',
        'best',
        '--audio-quality',
        this.getQualityValue(quality),
        '--format',
        this.getFormatSelector(quality),
        '--no-playlist',
        '--no-warnings',
        '--no-call-home',
        '--no-check-certificate',
      ];

      if (this.proxyUrl) {
        args.push('--proxy', this.proxyUrl);
      }

      if (this.cookiesPath) {
        args.push('--cookies', this.cookiesPath);
      }

      if (this.poToken) {
        args.push('--extractor-args', `youtube:po_token=${this.poToken}`);
      }

      args.push('-o', '-', url);

      const ytdlp = spawn('yt-dlp', args);

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
      const args = ['--dump-json', '--no-playlist', '--skip-download'];

      if (this.proxyUrl) {
        args.push('--proxy', this.proxyUrl);
      }

      if (this.cookiesPath) {
        args.push('--cookies', this.cookiesPath);
      }

      if (this.poToken) {
        args.push('--extractor-args', `youtube:po_token=${this.poToken}`);
      }

      args.push(url);

      const ytdlp = spawn('yt-dlp', args);

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
          const errorMessage = this.parseYtDlpError(errorOutput);
          this.logger.error('Metadata extraction failed', new Error(errorMessage));
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

  async getAvailableFormats(url: string): Promise<AudioFormat[]> {
    return new Promise((resolve, reject) => {
      const args = ['--list-formats', '--no-playlist'];

      if (this.proxyUrl) {
        args.push('--proxy', this.proxyUrl);
      }

      if (this.cookiesPath) {
        args.push('--cookies', this.cookiesPath);
      }

      args.push(url);

      const ytdlp = spawn('yt-dlp', args);

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
          this.logger.error('Failed to get formats', new Error(errorOutput));
          reject(new Error('Failed to get available formats'));
          return;
        }

        const formats = this.parseFormats(output);
        resolve(formats);
      });

      ytdlp.on('error', (error) => {
        this.logger.error('yt-dlp process error', error);
        reject(new Error(`Failed to execute yt-dlp: ${error.message}`));
      });
    });
  }

  private parseFormats(output: string): AudioFormat[] {
    const formats: AudioFormat[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Match audio-only formats (e.g., "249 webm audio only")
      if (line.includes('audio only') && !line.includes('video only')) {
        const match = line.match(/^(\S+)\s+(\S+)\s+.*?(\d+k)?.*$/);
        if (match) {
          formats.push({
            formatId: match[1],
            ext: match[2],
            quality: line.includes('audio only') ? 'audio only' : 'unknown',
            bitrate: match[3] || 'unknown',
          });
        }
      }
    }

    return formats.slice(0, 10); // Limit to 10 formats
  }

  private getQualityValue(quality: AudioQuality): string {
    switch (quality) {
      case 'best':
        return '0'; // Best quality
      case 'high':
        return '2'; // ~192kbps
      case 'medium':
        return '5'; // ~128kbps
      case 'low':
        return '7'; // ~64kbps
      default:
        return '0';
    }
  }

  private getFormatSelector(quality: AudioQuality): string {
    switch (quality) {
      case 'best':
        return 'bestaudio/best';
      case 'high':
        return 'bestaudio[abr<=192]/bestaudio/best';
      case 'medium':
        return 'bestaudio[abr<=128]/bestaudio/best';
      case 'low':
        return 'bestaudio[abr<=64]/bestaudio/best';
      default:
        return 'bestaudio/best';
    }
  }

  private parseYtDlpError(errorOutput: string): string {
    if (errorOutput.includes('Private video')) {
      return 'This is a private video. Cannot extract audio.';
    }
    if (errorOutput.includes('age')) {
      const hint = this.cookiesPath ? '' : ' (YouTube cookies required - add YOUTUBE_COOKIES to env)';
      return `Age-restricted video. Cannot extract audio${hint}.`;
    }
    if (errorOutput.includes('not available')) {
      return 'Video is unavailable or deleted.';
    }
    if (errorOutput.includes('copyright')) {
      return 'Video is blocked due to copyright.';
    }
    if (errorOutput.includes('Sign in')) {
      return 'YouTube requires authentication. Add YOUTUBE_COOKIES to environment.';
    }

    return 'Failed to extract audio. Check the link.';
  }
}
