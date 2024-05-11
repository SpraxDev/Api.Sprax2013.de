import type { FastifyInstance } from 'fastify';

export default interface Router {
  register(server: FastifyInstance): void;
}
