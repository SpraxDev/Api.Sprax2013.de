import '../../../../src/container-init.js';
import { FastifyInstance, type LightMyRequestResponse } from 'fastify';
import Sharp from 'sharp';
import { container } from 'tsyringe';
import FastifyWebServer from '../../../../src/webserver/FastifyWebServer.js';
import { EXISTING_MC_ID, EXISTING_MC_ID_WITH_HYPHENS, EXISTING_MC_NAME } from '../../test-constants.js';

describe('/mc/v1/capes/all', () => {
  test.each([
    [''],
    [EXISTING_MC_NAME],
    [EXISTING_MC_ID]
  ])('Expect 410 Gone: %j', async (user: string) => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

    const response = await fastify.inject({
      method: 'GET',
      url: '/mc/v1/capes/all/' + user
    });

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('public, max-age=300, s-maxage=300');

    expect(response.json()).toEqual({
      error: 'Gone',
      message: 'This endpoint was never intended for the general public and only returned the internal IDs used by this API to identify the skins (or null) – Please use one of the other cape endpoints instead'
    });
    expect(response.statusCode).toBe(410);
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: '/mc/v1/capes/all/' + EXISTING_MC_NAME
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});

describe('/mc/v1/capes/:capeType/:user?', () => {
  async function executeCapeRequest(capeType: string, user: string): Promise<LightMyRequestResponse> {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

    const response = await fastify.inject({
      method: 'GET',
      url: `/mc/v1/capes/${capeType}/${user}`
    });

    if (response.statusCode === 200 || response.statusCode === 404) {
      expect(response.headers['cache-control']).toBe('public, max-age=60, s-maxage=60');
    }

    return response;
  }

  test('Expect 400 for invalid cape type', async () => {
    const response = await executeCapeRequest('invalid', EXISTING_MC_ID);

    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid url parameters',
      details: [{ param: 'capeType', condition: `capeType in [mojang, optifine, labymod]` }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 for empty user', async () => {
    const response = await executeCapeRequest('mojang', '');

    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid url parameters',
      details: [{ param: 'user', condition: 'user.length > 0' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 for invalid user', async () => {
    const response = await executeCapeRequest('mojang', 'a'.repeat(20));

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid url parameters',
      details: [{ param: 'user', condition: 'user.length > 0' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 404 for non-existing user', async () => {
    const response = await executeCapeRequest('mojang', 'non-existing-$');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Not Found',
      message: 'Profile for given user'
    });
    expect(response.statusCode).toBe(404);
  });

  test('Expect 404 for existing user without cape for LabyMod', async () => {
    const response = await executeCapeRequest('labymod', '61699b2ed3274a019f1e0ea8c3f06bc6');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Not Found',
      message: 'User does not have a cape for that type'
    });

    expect(response.statusCode).toBe(404);
  });

  test.each([
    [EXISTING_MC_ID_WITH_HYPHENS],
    [EXISTING_MC_NAME],
    [EXISTING_MC_NAME + '?download=0'],
    [EXISTING_MC_NAME + '?download=false']
  ])('Expect OptiFine cape PNG for: %j', async (user: string) => {
    const response = await executeCapeRequest('optifine', user);

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const capeMetadata = await Sharp(response.rawPayload).metadata();

    expect(capeMetadata.format).toBe('png');
    if (capeMetadata.width === 46) {
      expect(capeMetadata.height).toBe(22);
    } else {
      expect(capeMetadata.width).toBe(92);
      expect(capeMetadata.height).toBe(44);
    }
  });

  test.each([
    [EXISTING_MC_ID + '?download=1'],
    [EXISTING_MC_NAME + '?download=true']
  ])('Expect OptiFine cape PNG with forced-download headers for: %j', async (user: string) => {
    const response = await executeCapeRequest('optifine', user);

    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['content-disposition']).toBe(`attachment; filename="${EXISTING_MC_NAME}-optifine.png"`);
    expect(response.statusCode).toBe(200);

    const capeMetadata = await Sharp(response.rawPayload).metadata();
    expect(capeMetadata.format).toBe('png');
  });

  test('Expect Mojang cape for Dinnerbone', async () => {
    // I just hope Dinnerbone always has a cape when the tests run :sweat_smile:
    const response = await executeCapeRequest('mojang', '61699b2ed3274a019f1e0ea8c3f06bc6');

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const capeMetadata = await Sharp(response.rawPayload).metadata();
    expect(capeMetadata.format).toBe('png');
    expect(capeMetadata.width).toBe(64);
    expect(capeMetadata.height).toBe(32);
  });

  test('Expect LabyMod cape for JNSAPH', async () => {
    // I just hope JNSAPH always has a cape when the tests run :sweat_smile:
    const response = await executeCapeRequest('labymod', '15b7285c8fcc460887c50e03a9bd8a10');

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const capeMetadata = await Sharp(response.rawPayload).metadata();
    expect(capeMetadata.format).toBe('png');
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: `/mc/v1/capes/mojang/${EXISTING_MC_ID}`
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});

describe('/mc/v1/capes/:capeType/:user/render', () => {
  async function executeCapeRenderRequest(capeType: string, user: string, downloadParam?: string): Promise<LightMyRequestResponse> {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

    const response = await fastify.inject({
      method: 'GET',
      url: `/mc/v1/capes/${capeType}/${user}/render` + (downloadParam != null ? `?download=${downloadParam}` : '')
    });

    if (response.statusCode === 200 || response.statusCode === 404) {
      expect(response.headers['cache-control']).toBe('public, max-age=60, s-maxage=60');
    }

    return response;
  }

  test('Expect 400 for invalid cape type', async () => {
    const response = await executeCapeRenderRequest('invalid', EXISTING_MC_ID);

    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid url parameters',
      details: [{ param: 'capeType', condition: `capeType in [mojang, optifine, labymod]` }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 for invalid user', async () => {
    const response = await executeCapeRenderRequest('mojang', 'a'.repeat(20));

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid url parameters',
      details: [{ param: 'user', condition: 'user.length > 0' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 404 for non-existing user', async () => {
    const response = await executeCapeRenderRequest('mojang', 'non-existing-$');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Not Found',
      message: 'Profile for given user'
    });
    expect(response.statusCode).toBe(404);
  });

  test('Expect 404 for existing user without cape for OptiFine', async () => {
    const response = await executeCapeRenderRequest('optifine', '407b28ede7bd451693d93361fecb7889' /* Sprax2013 */);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Not Found',
      message: 'User does not have a cape for that type'
    });

    expect(response.statusCode).toBe(404);
  });

  test.each([
    [EXISTING_MC_ID_WITH_HYPHENS, undefined],
    [EXISTING_MC_NAME, undefined],
    [EXISTING_MC_NAME, '0'],
    [EXISTING_MC_NAME, 'false']
  ])('Expect renderer OptiFine cape PNG for {user=%j, download=%j}', async (user: string, download: string | undefined) => {
    const response = await executeCapeRenderRequest('optifine', user, download);

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const capeMetadata = await Sharp(response.rawPayload).metadata();
    expect(capeMetadata.format).toBe('png');
    expect(capeMetadata.width).toBe(512);
    expect(capeMetadata.height).toBe(819);
  });

  test.each([
    ['0'],
    ['6'],
    ['1025']
  ])('Expect 400 for invalid size: %j', async (size: string) => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'GET',
      url: `/mc/v1/capes/optifine/${EXISTING_MC_ID}/render?size=${size}`
    });

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid query parameters',
      details: [{ param: 'size', condition: `size >= 8 and size <= 1024` }]
    });

    expect(response.statusCode).toBe(400);
  });

  test('Expect rendered OptiFine cape PNG with size=1024', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'GET',
      url: `/mc/v1/capes/optifine/${EXISTING_MC_ID}/render?size=1024`
    });

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const capeMetadata = await Sharp(response.rawPayload).metadata();
    expect(capeMetadata.format).toBe('png');
    expect(capeMetadata.width).toBe(1024);
    expect(capeMetadata.height).toBe(1638);
  });

  test.each([
    [EXISTING_MC_ID, '1'],
    [EXISTING_MC_NAME, 'true']
  ])('Expect renderer OptiFine cape PNG with forced-download headers for: %j', async (user: string, download: string) => {
    const response = await executeCapeRenderRequest('optifine', user, download);

    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['content-disposition']).toBe(`attachment; filename="${EXISTING_MC_NAME}-optifine.png"`);
    expect(response.statusCode).toBe(200);

    const capeMetadata = await Sharp(response.rawPayload).metadata();
    expect(capeMetadata.format).toBe('png');
  });

  test('Expect renderer Mojang cape for Dinnerbone', async () => {
    // I just hope Dinnerbone always has a cape when the tests run :sweat_smile:
    const response = await executeCapeRenderRequest('mojang', '61699b2ed3274a019f1e0ea8c3f06bc6');

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const capeMetadata = await Sharp(response.rawPayload).metadata();
    expect(capeMetadata.format).toBe('png');
    expect(capeMetadata.width).toBe(512);
    expect(capeMetadata.height).toBe(819);
  });

  test('Expect renderer LabyMod cape for JNSAPH', async () => {
    const response = await executeCapeRenderRequest('labymod', EXISTING_MC_ID);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Service Unavailable',
      message: 'Rendering LabyMod-Capes is currently not supported'
    });

    expect(response.statusCode).toBe(503);
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: `/mc/v1/capes/mojang/${EXISTING_MC_ID}/render`
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});
