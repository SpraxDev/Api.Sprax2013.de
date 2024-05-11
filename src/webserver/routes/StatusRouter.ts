import type { FastifyInstance } from 'fastify';
import FastifyWebServer from '../FastifyWebServer.js';
import Router from './Router.js';

export default class StatusRouter implements Router {
  register(server: FastifyInstance): void {
    server.all('/status', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => await reply.send({ online: true })
      });
    });
  }
}
