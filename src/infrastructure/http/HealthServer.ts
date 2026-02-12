import Fastify, { type FastifyInstance } from 'fastify';
import type { ILogger } from '../../domain/interfaces/ILogger.js';

/**
 * Infrastructure: Health Check Server
 * HTTP сервер для health checks (необходим для Render.com)
 */
export class HealthServer {
  private app: FastifyInstance;

  constructor(
    private readonly port: number,
    private readonly logger: ILogger,
  ) {
    this.app = Fastify({
      logger: false, // Используем свой логгер
    });

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    });

    // Root endpoint
    this.app.get('/', async () => {
      return {
        service: 'audio-drop-bot',
        status: 'running',
      };
    });
  }

  async start(): Promise<void> {
    try {
      await this.app.listen({ port: this.port, host: '0.0.0.0' });
      this.logger.info(`Health check server started on port ${this.port}`);
    } catch (error) {
      this.logger.error('Failed to start health check server', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.app.close();
    this.logger.info('Health check server stopped');
  }
}
