import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { injectAll, singleton } from 'tsyringe';
import { HttpError, NotFoundError } from '../http/errors/HttpErrors.js';
import SentrySdk from '../SentrySdk.js';
import Router from './routes/Router.js';

@singleton()
export default class FastifyWebServer {
  private readonly fastify: FastifyInstance;

  constructor(@injectAll('Router') routers: Router[]) {
    this.fastify = Fastify({
      ignoreDuplicateSlashes: true,
      ignoreTrailingSlash: true,

      trustProxy: false // TODO
    });

    this.fastify.setNotFoundHandler((): void => {
      throw new NotFoundError('Requested resource not found');
    });
    this.fastify.setErrorHandler((err: Error, _req: FastifyRequest, reply: FastifyReply): FastifyReply => {
      if (err instanceof HttpError) {
        return reply
          .code(err.httpStatusCode)
          .send({ error: err.httpErrorMessage });
      }

      SentrySdk.logAndCaptureError(err);
      return reply
        .code(500)
        .send('Internal Server Error');
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
    handlers: { [key: string]: () => FastifyReply | Promise<FastifyReply> }
  ): Promise<FastifyReply> {
    const method = (request.method || '').toLowerCase();

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
