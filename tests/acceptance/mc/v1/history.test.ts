import '../../../../src/container-init.js';
import { FastifyInstance } from 'fastify';
import { container } from 'tsyringe';
import FastifyWebServer from '../../../../src/webserver/FastifyWebServer.js';
import { EXISTING_MC_ID, EXISTING_MC_NAME } from '../../test-constants.js';

describe('/mc/v1/history/*', () => {
  test.each([
    [''],
    [EXISTING_MC_NAME],
    [EXISTING_MC_ID]
  ])('Expect 410 Gone: %j', async (user: string) => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

    const response = await fastify.inject({
      method: 'GET',
      url: '/mc/v1/history/' + user
    });

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('public, max-age=300, s-maxage=300');

    expect(response.json()).toEqual({
      error: 'Gone',
      message: 'This endpoint has been removed as Mojang removed the username history API (https://web.archive.org/web/20221006001721/https://help.minecraft.net/hc/en-us/articles/8969841895693-Username-History-API-Removal-FAQ-)'
    });
    expect(response.statusCode).toBe(410);
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: '/mc/v1/history/' + EXISTING_MC_NAME
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});
