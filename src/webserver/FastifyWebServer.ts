import * as Sentry from '@sentry/node';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { injectAll, singleton } from 'tsyringe';
import SentrySdk from '../util/SentrySdk.js';
import { HttpError, NotFoundError } from './errors/HttpErrors.js';
import Router from './routes/Router.js';

@singleton()
export default class FastifyWebServer {
  private readonly fastify: FastifyInstance;

  constructor(@injectAll('Router') routers: Router[]) {
    this.fastify = Fastify({
      ignoreDuplicateSlashes: true,
      ignoreTrailingSlash: true,
      
      // Performance optimizations
      keepAliveTimeout: 60000,
      connectionTimeout: 30000,
      bodyLimit: 1048576, // 1MB limit
      
      // Enable HTTP/2 for better performance
      http2: false, // Can be enabled when clients support it widely
      
      // Optimize for production
      disableRequestLogging: process.env.NODE_ENV === 'production',
      
      trustProxy: false, // TODO: Set to true when behind CloudFlare
    });
    Sentry.setupFastifyErrorHandler(this.fastify);

    this.fastify.setNotFoundHandler((): void => {
      throw new NotFoundError('Requested resource not found');
    });
    this.fastify.setErrorHandler((err: Error, _req: FastifyRequest, reply: FastifyReply): FastifyReply => {
      if (err instanceof HttpError) {
        return reply
          .code(err.httpStatusCode)
          .send(err.createResponseBody());
      }

      SentrySdk.logAndCaptureError(err);
      return reply
        .code(500)
        .send({ error: 'Internal Server Error' });
    });

    this.setupRouters(routers);
    this.setupPerformanceOptimizations();
  }

  private setupPerformanceOptimizations(): void {
    // Add global hooks for performance optimization
    this.fastify.addHook('onSend', async (request, reply, payload) => {
      // Add ETag for cacheable responses
      if (reply.statusCode === 200 && payload && !reply.hasHeader('etag')) {
        const contentType = reply.getHeader('content-type');
        
        // Add ETags for JSON and image responses
        if (typeof contentType === 'string' && 
            (contentType.includes('application/json') || contentType.includes('image/'))) {
          const etag = `"${createHash('md5').update(payload as Buffer).digest('hex')}"`;
          reply.header('etag', etag);
          
          // Check if client has matching ETag
          const clientEtag = request.headers['if-none-match'];
          if (clientEtag === etag) {
            reply.code(304);
            return '';
          }
        }
      }
      
      return payload;
    });
  }

  async listen(host: string, port: number): Promise<void> {
    await this.fastify.listen({ host, port });
  }

  async shutdown(): Promise<void> {
    await this.fastify.close();
  }

  private setupRouters(routers: Router[]): void {
    for (const router of routers) {
      router.register(this.fastify);
    }
  }

  static async handleRestfully(
    request: FastifyRequest,
    reply: FastifyReply,
    handlers: { [key: string]: () => FastifyReply | Promise<FastifyReply> },
  ): Promise<FastifyReply> {
    const method = request.method.toLowerCase();

    if (method in handlers) {
      await handlers[method]();
      return reply;
    }
    if (method == 'head' && 'get' in handlers) {
      await handlers['get']();
      return reply;
    }

    const allowedMethods: string[] = Object.keys(handlers);
    if (!allowedMethods.includes('head')) {
      allowedMethods.push('head');
    }

    return reply
      .status(405)
      .header('Allow', allowedMethods.join(', ').toUpperCase())
      .send('Method Not Allowed');
  }
}
