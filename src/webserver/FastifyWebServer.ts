import * as Sentry from '@sentry/node';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { injectAll, singleton } from 'tsyringe';
import { ContainerTokens } from '../constants.js';
import Metrics from '../metrics/Metrics.js';
import SentrySdk from '../util/SentrySdk.js';
import { HttpError, NotFoundError } from './errors/HttpErrors.js';
import Router from './routes/Router.js';

@singleton()
export default class FastifyWebServer {
  private readonly fastify: FastifyInstance;

  constructor(
    @injectAll(ContainerTokens.ROUTER) routers: Router[],
    private readonly metrics: Metrics,
  ) {
    this.fastify = Fastify({
      routerOptions: {
        ignoreDuplicateSlashes: true,
        ignoreTrailingSlash: true,
      },

      trustProxy: false, // TODO
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
    this.fastify.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply): void => {
      if (!['/metrics', '/status', '/favicon.ico'].includes(request.originalUrl)) {
        this.metrics.collectIncomingHttpRequest(request.method, reply.statusCode);
      }
    });

    this.setupRouters(routers);
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
