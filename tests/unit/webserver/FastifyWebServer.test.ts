import { jest } from '@jest/globals';
import { FastifyInstance, type FastifyReply } from 'fastify';
import SentrySdk from '../../../src/util/SentrySdk.js';
import FastifyWebServer from '../../../src/webserver/FastifyWebServer.js';
import Router from '../../../src/webserver/routes/Router.js';

class TestRouter implements Router {
  register(server: FastifyInstance): void {
    server.get('/hello', (request, reply): FastifyReply => {
      return reply.send('Hello World');
    });

    server.get('/uncaught-error', (): FastifyReply => {
      throw new Error('Uncaught Error');
    });

    server.all('/restful', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: (): FastifyReply => reply.send('GET'),
        post: (): FastifyReply => reply.send('POST')
      });
    });
  }
}

const fastifyWebServer = new FastifyWebServer([new TestRouter()]);
const fastify = (fastifyWebServer as any).fastify as FastifyInstance;

beforeEach(() => {
  jest.spyOn(SentrySdk, 'logAndCaptureError').mockReturnValue(undefined);
});

describe('FastifyWebServer', () => {
  test('Requesting an unknown endpoint should return 404', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/non-existing-endpoint'
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Requested resource not found' });
  });

  test('A request throwing an uncaught error should return 500', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/uncaught-error'
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Internal Server Error' });
    expect(SentrySdk.logAndCaptureError).toHaveBeenCalledTimes(1);
  });

  test('#listen should call the Fastify server', async () => {
    const listenSpy = jest.spyOn(fastify, 'listen').mockResolvedValue('' as never);
    await fastifyWebServer.listen('127.0.0.1', 8080);

    expect(listenSpy).toHaveBeenCalledTimes(1);
    expect(listenSpy).toHaveBeenCalledWith({ host: '127.0.0.1', port: 8080 });
  });

  test('#shutdown should call the Fastify server', async () => {
    const closeSpy = jest.spyOn(fastify, 'close').mockReturnValue(undefined);
    await fastifyWebServer.shutdown();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('static #handleRestfully', () => {
  test.each([
    'GET',
    'POST'
  ] satisfies ('GET' | 'POST')[])('Expect 200 for existing method handler: %s', async (method: 'GET' | 'POST') => {
    const response = await fastify.inject({
      method,
      url: '/restful'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(method);
  });

  test('Expect 405 for non-existing method handler', async () => {
    const response = await fastify.inject({
      method: 'PUT',
      url: '/restful'
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, POST, HEAD');
  });

  test('Expect HEAD requests to properly return 200', async () => {
    const response = await fastify.inject({
      method: 'HEAD',
      url: '/restful'
    });

    expect(response.statusCode).toBe(200);

    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(response.headers['content-length']).toBe('3');
  });
});
