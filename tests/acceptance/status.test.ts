import '../../src/container-init.js';
import { FastifyInstance } from 'fastify';
import { container } from 'tsyringe';
import FastifyWebServer from '../../src/webserver/FastifyWebServer.js';

describe('/mc/v1/history/*', () => {
  test('Expect 200 OK: %j', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

    const response = await fastify.inject({
      method: 'GET',
      url: '/status'
    });

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBeUndefined();

    expect(response.json()).toEqual({ online: true });
    expect(response.statusCode).toBe(200);
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: '/status'
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});
