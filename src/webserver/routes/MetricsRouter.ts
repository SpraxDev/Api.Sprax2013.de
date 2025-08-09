import type { FastifyInstance, FastifyReply } from 'fastify';
import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../constants.js';
import Metrics from '../../metrics/Metrics.js';
import FastifyWebServer from '../FastifyWebServer.js';
import Router from './Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class MetricsRouter implements Router {
  constructor(
    private readonly metrics: Metrics,
  ) {
  }

  register(server: FastifyInstance): void {
    server.all('/metrics', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          return reply
            .header('Cache-Control', 'no-cache')
            .type('text/plain; version=0.0.4; charset=utf-8')
            .send(this.metrics.toPrometheusMetrics());
        },
      });
    });
  }
}
