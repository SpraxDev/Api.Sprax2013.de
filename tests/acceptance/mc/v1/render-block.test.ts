import '../../../../src/container-init.js';
import { FastifyInstance, type LightMyRequestResponse } from 'fastify';
import Sharp from 'sharp';
import { container } from 'tsyringe';
import FastifyWebServer from '../../../../src/webserver/FastifyWebServer.js';

describe('/mc/v1/render/block', () => {
  const blockTexture = Sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: { r: 125, g: 125, b: 125 }
    }
  })
    .png()
    .toBuffer();

  test('Expect 400 for missing body', async () => {
    const response = await executeRenderBlockRequest(undefined, undefined);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid body',
      details: [{ param: 'Content-Type', condition: 'image/png' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 for body with missing content-type', async () => {
    const response = await executeRenderBlockRequest(await blockTexture, undefined);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid body',
      details: [{ param: 'Content-Type', condition: 'image/png' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 for body with JPEG content-type', async () => {
    const response = await executeRenderBlockRequest(await blockTexture, 'image/jpeg');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid body',
      details: [{ param: 'Content-Type', condition: 'image/png' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 with invalid/non-image body', async () => {
    const response = await executeRenderBlockRequest(Buffer.concat([Buffer.from('hello'), await blockTexture]), 'image/png');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid body',
      details: [{ param: 'body', condition: 'Valid PNG' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect 400 with too-large body', async () => {
    const response = await executeRenderBlockRequest(Buffer.alloc(5 * 1024 * 1024, 1), 'image/png');

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid body',
      details: [{ param: 'body', condition: 'body under 3 MiB' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test.each([
    [0],
    [4],
    [1025],
    [2000]
  ])('Expect 400 for invalid size: %d', async (size: number) => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'GET',
      url: `/mc/v1/render/block?size=${size}`,
      headers: { 'Content-Type': 'image/png' },
      body: await blockTexture
    });

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid query parameters',
      details: [{ param: 'size', condition: 'size >= 8 and size <= 1024' }]
    });
    expect(response.statusCode).toBe(400);
  });

  test('Expect image response with PNG body', async () => {
    const response = await executeRenderBlockRequest(await blockTexture, 'image/png');

    expect(response.headers['content-type']).toBe('image/png');
    expect(Buffer.isBuffer(response.rawPayload)).toBe(true);

    const imageMetadata = await Sharp(response.rawPayload).metadata();
    expect(imageMetadata.format).toBe('png');
    expect(imageMetadata.width).toBe(150);
    expect(imageMetadata.height).toBe(150);
    expect(imageMetadata.hasAlpha).toBe(true);

    const imageStats = await Sharp(response.rawPayload).stats();
    expect(imageStats.dominant).toEqual({ r: 120, g: 120, b: 120 });

    expect(response.statusCode).toBe(200);
  });

  test('Expect image response with PNG body for ?size=1024', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'GET',
      url: '/mc/v1/render/block?size=1024',
      headers: { 'Content-Type': 'image/png' },
      body: await blockTexture
    });

    expect(response.headers['content-type']).toBe('image/png');
    expect(Buffer.isBuffer(response.rawPayload)).toBe(true);

    const imageMetadata = await Sharp(response.rawPayload).metadata();
    expect(imageMetadata.format).toBe('png');
    expect(imageMetadata.width).toBe(1024);
    expect(imageMetadata.height).toBe(1024);
    expect(imageMetadata.hasAlpha).toBe(true);

    const imageStats = await Sharp(response.rawPayload).stats();
    expect(imageStats.dominant).toEqual({ r: 120, g: 120, b: 120 });

    expect(response.statusCode).toBe(200);
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: '/mc/v1/render/block'
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});

async function executeRenderBlockRequest(body: Buffer | undefined, contentType: string | undefined): Promise<LightMyRequestResponse> {
  const fastifyWebServer = container.resolve(FastifyWebServer);
  const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

  return await fastify.inject({
    method: 'GET',
    url: '/mc/v1/render/block',
    headers: contentType != null ? { 'Content-Type': contentType } : undefined,
    body
  });
}
