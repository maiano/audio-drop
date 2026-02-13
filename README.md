# 🎵 Audio Drop Bot

Telegram bot for extracting audio from YouTube videos.

## Features

- Extract audio from YouTube videos
- Optimized Opus format (32kbps) for speech
- Direct streaming to Telegram (no disk storage)
- Link validation and video availability check
- Concurrent request protection per user
- Clean Architecture with full TypeScript typing

## Tech Stack

- **TypeScript** - Full type safety
- **Grammy** - Modern Telegram bot framework
- **Fastify** - HTTP health check server
- **Pino** - Structured logging
- **yt-dlp** - Audio extraction
- **Zod** - Runtime validation
- **Biome** - Linting and formatting

## Quick Start

### Prerequisites

- Node.js >= 20
- Docker (optional, for deployment)
- Telegram Bot Token (get from [@BotFather](https://t.me/BotFather))

### Local Development

```bash
# Install dependencies
npm install

# Install yt-dlp and ffmpeg
brew install yt-dlp ffmpeg  # macOS
# or
sudo apt install ffmpeg && pip install yt-dlp  # Linux

# Create .env file
cp .env.example .env
# Add your BOT_TOKEN to .env

# Run in development mode
npm run dev
```

### Docker

```bash
# Using Docker Compose
docker compose up -d

# View logs
docker compose logs -f
```

## Environment Variables

```env
BOT_TOKEN=your_bot_token_here
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
```

## Deployment

### Render.com

1. Create account on [Render.com](https://render.com)
2. Connect your GitHub repository
3. Render will auto-detect `render.yaml`
4. Add `BOT_TOKEN` in environment variables
5. Deploy!

## Architecture

```
src/
├── domain/              # Business logic
│   ├── entities/        # AudioRequest, AudioFile
│   └── interfaces/      # IAudioExtractor, ILogger
├── application/         # Use cases
│   └── usecases/        # ProcessAudioRequest
├── infrastructure/      # External dependencies
│   ├── telegram/        # Grammy bot wrapper
│   ├── youtube/         # yt-dlp wrapper
│   └── http/            # Fastify server, Pino logger
├── presentation/        # Message handlers
│   └── telegram/        # Telegram handlers
├── config/              # Configuration
└── index.ts             # Entry point
```

## Usage

1. Find the bot in Telegram
2. Send `/start`
3. Send a YouTube link
4. Receive the audio file

### Supported Link Formats

- `https://youtube.com/watch?v=...`
- `https://youtu.be/...`
- `https://youtube.com/shorts/...`

### Limitations

- Maximum duration: 2 hours
- Public videos only
- Format: Opus (optimized for speech)

## Development Commands

```bash
npm run dev         # Development mode with hot reload
npm run build       # Compile TypeScript
npm run start       # Run production build
npm run lint        # Check linting
npm run lint:fix    # Auto-fix linting issues
npm run format      # Format code
```

## License

ISC
