import Fastify, { type FastifyError, FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { singleton } from 'tsyringe';
import SentrySdk from '../SentrySdk.js';

@singleton()
export default class FastifyWebServer {
  private readonly fastify: FastifyInstance;

  constructor() {
    this.fastify = Fastify({
      ignoreDuplicateSlashes: true,
      ignoreTrailingSlash: true,

      trustProxy: false // TODO
    });

    this.fastify.setNotFoundHandler((_request, reply) => {
      return reply
        .code(404)
        .type('application/json')
        .send('{"error":"Not Found"}');
    });
    this.fastify.setErrorHandler((err: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
      SentrySdk.logAndCaptureError(err);

      return reply
        .code(500)
        .send('Internal Server Error');
    });
    SentrySdk.setupSentryFastifyIntegration(this.fastify);
  }

  async listen(host: string, port: number): Promise<void> {
    await this.fastify.listen({ host, port });
  }

  async shutdown(): Promise<void> {
    await this.fastify.close();
  }
}
