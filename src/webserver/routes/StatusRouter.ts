import type { FastifyInstance, FastifyReply } from 'fastify';
import { PerformanceMonitor } from '../../util/PerformanceMonitor.js';
import FastifyWebServer from '../FastifyWebServer.js';
import Router from './Router.js';

export default class StatusRouter implements Router {
  register(server: FastifyInstance): void {
    server.all('/status', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => reply.send({ 
          online: true,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        }),
      });
    });

    server.all('/status/performance', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => reply.send({
          online: true,
          timestamp: new Date().toISOString(),
          performance: PerformanceMonitor.getStats(),
          summary: PerformanceMonitor.getSummary(),
        }),
      });
    });
  }
}
