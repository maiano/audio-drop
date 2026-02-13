import Fastify, { type FastifyInstance } from 'fastify';
import type { ILogger } from '../../domain/interfaces/ILogger.js';

export class HealthServer {
  private app: FastifyInstance;

  constructor(
    private readonly port: number,
    private readonly logger: ILogger,
  ) {
    this.app = Fastify({ logger: false });
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    });

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
