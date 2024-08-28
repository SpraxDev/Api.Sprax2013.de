import '../../../../src/container-init.js';
import { FastifyInstance, type LightMyRequestResponse } from 'fastify';
import Sharp from 'sharp';
import { container } from 'tsyringe';
import FastifyWebServer from '../../../../src/webserver/FastifyWebServer.js';
import { EXISTING_MC_ID, EXISTING_MC_ID_WITH_HYPHENS, EXISTING_MC_NAME } from '../../../test-constants.js';

const LEGACY_SKIN_URL = 'https://textures.minecraft.net/texture/292009a4925b58f02c77dadc3ecef07ea4c7472f64e0fdc32ce5522489362680';

describe('/mc/v1/skin/:user', () => {
  async function executeSkinRequest(user: string, urlSuffix = ''): Promise<LightMyRequestResponse> {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

    const response = await fastify.inject({
      method: 'GET',
      url: `/mc/v1/skin/${user}${urlSuffix}`
    });

    if (response.statusCode === 200 || response.statusCode === 404) {
      expect(response.headers['cache-control']).toBe('public, max-age=60, s-maxage=60');
    }

    return response;
  }

  // FIXME: [skipped] optional parameters in the URL work differently in Fastify vs. Express
  test.skip('Expect 400 for empty user', async () => {
    const response = await executeSkinRequest('');

    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid url parameters',
      details: [{ param: 'user', condition: 'user.length > 0' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 404 for non-existing user', async () => {
    const response = await executeSkinRequest('non-existing-$');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Not Found',
      message: 'Profile for given user'
    });
    expect(response.statusCode).toBe(404);
  });

  test.each([
    [EXISTING_MC_ID_WITH_HYPHENS, ''],
    [EXISTING_MC_NAME, ''],
    [EXISTING_MC_NAME, '?download=0'],
    [EXISTING_MC_NAME, '?download=false'],
    [EXISTING_MC_NAME, '?raw=0'],
    [EXISTING_MC_NAME, '?raw=false'],
    [EXISTING_MC_NAME, '?raw=false&download=false'],
    [EXISTING_MC_NAME, '?raw=0&download=0'],
    ['x-url', `?url=${LEGACY_SKIN_URL}`],
    ['x-url', `?url=${LEGACY_SKIN_URL}&raw=0`]
  ])('Expect skin PNG for: %j', async (user: string, urlSuffix: string) => {
    const response = await executeSkinRequest(user, urlSuffix);

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const skinMetadata = await Sharp(response.rawPayload).metadata();

    expect(skinMetadata.format).toBe('png');
    expect(skinMetadata.width).toBe(64);
    expect(skinMetadata.height).toBe(64);
  });

  test.each([
    [EXISTING_MC_ID, '?download=1'],
    [EXISTING_MC_NAME, '?download=true'],
    [EXISTING_MC_NAME, '?download=true&raw=false'],
    [EXISTING_MC_NAME, '?download=1&raw=0'],
    ['x-url', `?url=${LEGACY_SKIN_URL}&download=1`]
  ])('Expect skin PNG with forced-download headers for: %j', async (user: string, urlSuffix: string) => {
    const response = await executeSkinRequest(user, urlSuffix);

    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['content-disposition']).toBe(`attachment; filename="${user === 'x-url' ? 'x-url' : EXISTING_MC_NAME}.png"`);
    expect(response.statusCode).toBe(200);

    const skinMetadata = await Sharp(response.rawPayload).metadata();
    expect(skinMetadata.format).toBe('png');
    expect(skinMetadata.width).toBe(64);
    expect(skinMetadata.height).toBe(64);
  });

  test.each([
    ['069a79f444e94726a5befca90e38aaf5'],
    ['069a79f444e94726a5befca90e38aaf5?raw=0'],
    ['069a79f444e94726a5befca90e38aaf5?raw=false']
  ])('User with legacy skin (Notch) returns upgraded skin: %j', async (user: string) => {
    const response = await executeSkinRequest(user);

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const skinMetadata = await Sharp(response.rawPayload).metadata();
    expect(skinMetadata.format).toBe('png');
    expect(skinMetadata.width).toBe(64);
    expect(skinMetadata.height).toBe(64);
  });

  test.each([
    ['069a79f444e94726a5befca90e38aaf5?raw=1'],
    ['069a79f444e94726a5befca90e38aaf5?raw=true']
  ])('User with legacy skin (Notch) can be requested raw: %j', async (user: string) => {
    const response = await executeSkinRequest(user);

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const skinMetadata = await Sharp(response.rawPayload).metadata();
    expect(skinMetadata.format).toBe('png');
    expect(skinMetadata.width).toBe(64);
    expect(skinMetadata.height).toBe(32);
  });

  test('Expect 400 when setting overlay parameter for normal skin request', async () => {
    const response = await executeSkinRequest(EXISTING_MC_ID, '?overlay=1');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Cannot use "overlay" when just requesting the skin file (without "skinArea" or "3d")'
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 when setting size parameter for normal skin request', async () => {
    const response = await executeSkinRequest(EXISTING_MC_ID, '?size=250');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Cannot use "size" when just requesting the skin file (without "skinArea" or "3d")'
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 when setting slim parameter for normal skin request', async () => {
    const response = await executeSkinRequest(EXISTING_MC_ID, '?slim=0');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Cannot use "slim" when just requesting the skin file (without "skinArea" or "3d")'
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: `/mc/v1/skin/${EXISTING_MC_ID}`
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});

describe.each([
  [false],
  [true]
])('/mc/v1/skin/x-url/* error cases (request3D=%j)', (request3D: boolean) => {
  async function executeSkinRequest(urlSuffix: string): Promise<LightMyRequestResponse> {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

    return fastify.inject({
      method: 'GET',
      url: `/mc/v1/skin/x-url/head${request3D ? '/3d' : ''}${urlSuffix}`
    });
  }

  test.each([
    [''],
    ['?url=']
  ])('Expect 400 for empty skin URL parameter: %j', async (urlSuffix: string) => {
    const response = await executeSkinRequest(urlSuffix);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid query parameters',
      details: [{ param: 'url', condition: 'url.length > 0' }]
    });
  });

  test('Expect 400 for invalid skin URL parameter', async () => {
    const response = await executeSkinRequest('?url=invalid');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid query parameters',
      details: [{ param: 'url', condition: 'url needs to be a valid URL (e.g. start with https://)' }]
    });
  });

  test('Expect 400 for non-https skin URL parameter', async () => {
    const response = await executeSkinRequest('?url=http://example.com');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid query parameters',
      details: [{ param: 'url', condition: 'url needs to be an https URL' }]
    });
  });

  test.each([
    ['https://127.0.0.1'],
    ['https://127.0.0.2'],
    ['https://192.168.1.1'],
    ['https://10.0.0.1'],
    ['https://224.0.0.1'],
    ['https://[::1]'],
    ['https://[fc00::1]'],
    ['https://[fe80::1]'],
    ['https://[ff00::1]'],
    ['https://spraxapi-automated-test-private-ipv4.sprax.me'],
    ['https://spraxapi-automated-test-private-ipv6.sprax.me']
  ])('Expect 400 for non-unicast URL %j', async (url: string) => {
    const response = await executeSkinRequest('?url=' + url);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid query parameters',
      details: [{ param: 'url', condition: 'url needs to point to a public IP address' }]
    });
  });

  test('Expect 400 for skin URL that responds non successful', async () => {
    const response = await executeSkinRequest('?url=https://textures.minecraft.net/texture/non-existant');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Provided URL returned 404 (Not Found)'
    });
  });

  test('Expect 400 for setting raw=1 when requesting a rendered image', async () => {
    const response = await executeSkinRequest(`?raw=1&url=${LEGACY_SKIN_URL}`);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Cannot use "raw" when requesting a rendered skin (3d or skinArea)'
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 for setting slim parameter when requesting a rendered head', async () => {
    const response = await executeSkinRequest(`?slim=1&url=${LEGACY_SKIN_URL}`);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Cannot use "slim" when requesting the rendered head'
    });
    expect(response.statusCode).toBe(400);
  });
});

describe.each([
  [false, EXISTING_MC_NAME, null],
  [true, EXISTING_MC_NAME, null],

  [false, 'x-url', LEGACY_SKIN_URL],
  [true, 'x-url', LEGACY_SKIN_URL]
])('/mc/v1/skin/:user/:skinArea(/3d) (3D: %j, user: %j)', (request3D: boolean, user: string, skinUrl: string | null) => {
  async function executeSkinRequest(skinArea: 'head' | 'body', suffix = '', method: 'GET' | 'POST' = 'GET'): Promise<LightMyRequestResponse> {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

    if (skinUrl != null) {
      if (suffix.length > 0) {
        suffix += '&';
      } else {
        suffix += '?';
      }
      suffix += 'url=' + encodeURIComponent(skinUrl);
    }

    const response = await fastify.inject({
      method,
      url: `/mc/v1/skin/${user}/${skinArea}${request3D ? '/3d' : ''}${suffix}`
    });

    if (response.statusCode === 200 || response.statusCode === 404) {
      expect(response.headers['cache-control']).toBe('public, max-age=60, s-maxage=60');
    }

    return response;
  }

  test.each([
    [''],
    ['head'],
    ['body']
  ])('Expect 404 for non-existing user with skinArea: %j', async (skinArea: string) => {
    if (user === 'x-url') {
      return;
    }

    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

    const response = await fastify.inject({
      method: 'GET',
      url: `/mc/v1/skin/9073926b-929f-31c2-abc9-fad77ae3e8eb/${skinArea}${request3D ? '/3d' : ''}`
    });

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Not Found',
      message: 'Profile for given user'
    });
    expect(response.statusCode).toBe(404);

    expect(response.headers['cache-control']).toBe('public, max-age=60, s-maxage=60');
  });

  test.each([
    [''],
    ['?size=512'],
    ['?download=0'],
    ['?download=false'],
    ['?raw=0'],
    ['?raw=false'],
    ['?raw=false&download=false'],
    ['?raw=0&download=0']
  ])('Expect rendered head for: %j', async (urlSuffix: string) => {
    const response = await executeSkinRequest('head', urlSuffix);

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const skinMetadata = await Sharp(response.rawPayload).metadata();

    expect(skinMetadata.format).toBe('png');

    if (request3D) {
      expect(skinMetadata.width).toBe(555);
      expect(skinMetadata.height).toBe(512);
    } else {
      expect(skinMetadata.width).toBe(512);
      expect(skinMetadata.height).toBe(512);
    }
  });

  test('Expect rendered head with custom size', async () => {
    const response = await executeSkinRequest('head', '?size=1024');

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const skinMetadata = await Sharp(response.rawPayload).metadata();

    expect(skinMetadata.format).toBe('png');

    if (request3D) {
      expect(skinMetadata.width).toBe(1109);
      expect(skinMetadata.height).toBe(1024);
    } else {
      expect(skinMetadata.width).toBe(1024);
      expect(skinMetadata.height).toBe(1024);
    }
  });

  test.each([
    ['?download=1&size=512'],
    ['?download=1'],
    ['?download=true'],
    ['?download=true&raw=false'],
    ['?download=1&raw=0']
  ])('Expect rendered head PNG with forced-download headers for: %j', async (urlSuffix: string) => {
    const response = await executeSkinRequest('head', urlSuffix);

    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['content-disposition']).toBe(`attachment; filename="${user === 'x-url' ? 'x-url' : EXISTING_MC_NAME}-head.png"`);
    expect(response.statusCode).toBe(200);

    const skinMetadata = await Sharp(response.rawPayload).metadata();
    expect(skinMetadata.format).toBe('png');

    if (request3D) {
      expect(skinMetadata.width).toBe(555);
      expect(skinMetadata.height).toBe(512);
    } else {
      expect(skinMetadata.width).toBe(512);
      expect(skinMetadata.height).toBe(512);
    }
  });

  test.each([
    [''],
    ['?size=512']
  ])('Expect rendered body PNG for %j', async (urlSuffix: string) => {
    const response = await executeSkinRequest('body', urlSuffix);

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const skinMetadata = await Sharp(response.rawPayload).metadata();
    expect(skinMetadata.format).toBe('png');

    if (request3D) {
      expect(skinMetadata.width).toBe(512);
      expect(skinMetadata.height).toBe(936);
    } else {
      expect(skinMetadata.width).toBe(512);
      expect(skinMetadata.height).toBe(1024);
    }
  });

  test('Expect rendered body PNG with custom size', async () => {
    const response = await executeSkinRequest('body', '?size=1024');

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.statusCode).toBe(200);

    const skinMetadata = await Sharp(response.rawPayload).metadata();
    expect(skinMetadata.format).toBe('png');

    if (request3D) {
      expect(skinMetadata.width).toBe(1024);
      expect(skinMetadata.height).toBe(1872);
    } else {
      expect(skinMetadata.width).toBe(1024);
      expect(skinMetadata.height).toBe(2048);
    }
  });

  test('Expect 400 for invalid size parameter', async () => {
    const response = await executeSkinRequest('head', '?size=invalid');

    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid query parameters',
      details: [{ param: 'size', condition: 'size >= 8 and size <= 1024' }]
    });
  });

  test('Expect 400 for invalid skinArea', async () => {
    const response = await executeSkinRequest('invalid' as any);

    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid url parameters',
      details: [{ param: 'skinArea', condition: 'Equal (ignore case) one of the following: "HEAD", "BODY"' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 for invalid download parameter', async () => {
    const response = await executeSkinRequest('head', '?download=invalid');

    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Expected a "1", "0", "true" or "false" but got "invalid"'
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const response = await executeSkinRequest('head', '', 'POST');

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});
