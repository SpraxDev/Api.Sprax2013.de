import '../../../../src/container-init.js';
import { FastifyInstance, type LightMyRequestResponse } from 'fastify';
import { container } from 'tsyringe';
import FastifyWebServer from '../../../../src/webserver/FastifyWebServer.js';
import { EXISTING_MC_ID, EXISTING_MC_ID_WITH_HYPHENS, EXISTING_MC_NAME } from '../../test-constants.js';

describe('/mc/v1/profile/*', () => {
  test('Expect 400 for empty username', async () => {
    const response = await executeProfileRequest('');

    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid url parameters',
      details: [{ param: 'user', condition: 'user.length > 0' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test.each([
    [EXISTING_MC_ID],
    [EXISTING_MC_ID_WITH_HYPHENS],
    [EXISTING_MC_NAME],
    [EXISTING_MC_NAME.toUpperCase()],
    [EXISTING_MC_ID + '?raw=true'],
    [EXISTING_MC_ID + '?full=false'],
    [EXISTING_MC_ID + '?raw=true&full=false']
  ])('Expect 200: %j', async (user: string) => {
    const response = await executeProfileRequest(user);
    const responseBody = response.json();

    expect(responseBody).toEqual({
      id: EXISTING_MC_ID,
      name: EXISTING_MC_NAME,
      properties: [{
        name: 'textures',
        value: expect.anything(),
        signature: expect.anything()
      }],
      profileActions: [],
      legacy: false
    });
    expect(typeof responseBody.properties[0].value).toBe('string');
    expect(responseBody.properties[0].value.length).toBeGreaterThan(0);
    expect(typeof responseBody.properties[0].signature).toBe('string');
    expect(responseBody.properties[0].signature.length).toBeGreaterThan(0);

    expect(response.statusCode).toBe(200);
  });

  test.each([
    ['?raw=false'],
    ['?full=true'],
    ['?full=false&raw=false']
  ])('Expect 200 and different response with %j', async (urlSuffix: string) => {
    const response = await executeProfileRequest(EXISTING_MC_ID + urlSuffix);
    const responseBody = response.json();

    expect(responseBody).toEqual({
      id: EXISTING_MC_ID,
      id_hyphens: EXISTING_MC_ID_WITH_HYPHENS,
      name: EXISTING_MC_NAME,
      legacy: false,

      textures: expect.objectContaining({
        skinUrl: expect.anything(),
        texture_value: expect.anything(),
        texture_signature: expect.anything()
      }),

      profile_actions: [],
      name_history: []
    });
    expect(typeof responseBody.textures.skinUrl).toBe('string');
    expect(responseBody.textures.skinUrl).toMatch(/^https?:\/\/textures\.minecraft\.net\//i);
    expect(typeof responseBody.textures.texture_value).toBe('string');
    expect(responseBody.textures.texture_value.length).toBeGreaterThan(0);
    expect(typeof responseBody.textures.texture_signature).toBe('string');
    expect(responseBody.textures.texture_signature.length).toBeGreaterThan(0);

    if (responseBody.textures.capeUrl !== null) {
      expect(typeof responseBody.textures.capeUrl).toBe('string');
      expect(responseBody.textures.capeUrl).toMatch(/^https?:\/\/textures\.minecraft\.net\//i);
    }

    expect(response.statusCode).toBe(200);
  });

  test.each([
    ['non-existing-$'],
    ['fdddfd0c-21ed-385b-a01a-ec96f6e0ffbe'] // UUIDv3
  ])('Expect 404: %j', async (username: string) => {
    const response = await executeProfileRequest(username);

    expect(response.json()).toEqual({
      error: 'Not Found',
      message: 'Profile for given user'
    });
    expect(response.statusCode).toBe(404);
  });

  test('Expect 400 for invalid username', async () => {
    const response = await executeProfileRequest('a'.repeat(30));

    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid url parameters',
      details: [{ param: 'user', condition: 'Is valid uuid string or user.length <= 16' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: '/mc/v1/profile/' + EXISTING_MC_ID
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});

async function executeProfileRequest(user: string, method: 'GET' | 'POST' = 'GET'): Promise<LightMyRequestResponse> {
  const fastifyWebServer = container.resolve(FastifyWebServer);
  const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

  const response = await fastify.inject({
    method,
    url: '/mc/v1/profile/' + user
  });

  expect(response.headers['content-type']).toBe('application/json; charset=utf-8');

  if (response.statusCode === 200 || response.statusCode === 404) {
    expect(response.headers['cache-control']).toMatch(/^public, max-age=(60|300), s-maxage=\1$/);
  }

  return response;
}
