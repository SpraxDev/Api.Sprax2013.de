import '../../../../src/container-init.js';
import { FastifyInstance, type LightMyRequestResponse } from 'fastify';
import { container } from 'tsyringe';
import FastifyWebServer from '../../../../src/webserver/FastifyWebServer.js';
import { EXISTING_MC_ID, EXISTING_MC_ID_WITH_HYPHENS, EXISTING_MC_NAME } from '../../../test-constants.js';

describe('/mc/v1/uuid/*', () => {
  test('Expect 400 for empty username', async () => {
    const response = await executeUuidRequest('');

    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid url parameters',
      details: [{ param: 'name', condition: 'name.length > 0' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test.each([
    [EXISTING_MC_NAME],
    [EXISTING_MC_NAME.toUpperCase()]
  ])('Expect 200: %j', async (username: string) => {
    const response = await executeUuidRequest(username);

    expect(response.json()).toEqual({
      id: EXISTING_MC_ID,
      name: EXISTING_MC_NAME
    });
    expect(response.statusCode).toBe(200);
  });

  test.each([
    ['non-existing-$'],
    ['a'.repeat(30)],
    [EXISTING_MC_ID],
    [EXISTING_MC_ID_WITH_HYPHENS],
    [EXISTING_MC_ID_WITH_HYPHENS.toUpperCase()]
  ])('Expect 404: %j', async (username: string) => {
    const response = await executeUuidRequest(username);

    expect(response.json()).toEqual({
      error: 'Not Found',
      message: 'UUID for given username'
    });
    expect(response.statusCode).toBe(404);
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: '/mc/v1/uuid/' + EXISTING_MC_NAME
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});

async function executeUuidRequest(username: string, method: 'GET' | 'POST' = 'GET'): Promise<LightMyRequestResponse> {
  const fastifyWebServer = container.resolve(FastifyWebServer);
  const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

  const response = await fastify.inject({
    method,
    url: '/mc/v1/uuid/' + username
  });

  expect(response.headers['content-type']).toBe('application/json; charset=utf-8');

  if (response.statusCode === 200 || response.statusCode === 404) {
    expect(response.headers['cache-control']).toMatch(/^public, max-age=(60|120|300), s-maxage=\1$/);
  }

  return response;
}
