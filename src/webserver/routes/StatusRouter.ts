import type { FastifyInstance, FastifyReply } from 'fastify';
import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../constants.js';
import FastifyWebServer from '../FastifyWebServer.js';
import Router from './Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class StatusRouter implements Router {
  register(server: FastifyInstance): void {
    server.all('/status', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => reply.send({ online: true }),
      });
    });
  }
}
