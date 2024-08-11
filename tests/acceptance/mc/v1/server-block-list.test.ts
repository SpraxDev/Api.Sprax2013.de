import '../../../../src/container-init.js';
import { FastifyInstance } from 'fastify';
import { DeepMockProxy } from 'jest-mock-extended';
import { container } from 'tsyringe';
import DatabaseClient from '../../../../src/database/DatabaseClient.js';
import FastifyWebServer from '../../../../src/webserver/FastifyWebServer.js';

describe('/mc/v1/servers/blocked', () => {
  let databaseClient: DeepMockProxy<DatabaseClient>;

  beforeEach(() => {
    databaseClient = container.resolve(DatabaseClient) as DeepMockProxy<DatabaseClient>;
    databaseClient.serverBlocklist.findMany
      .mockResolvedValue([
        { sha1: Buffer.from('0caaf24ab1a0c33440c06afe99df986365b0781f', 'hex') },
        { sha1: Buffer.from('8c7122d652cb7be22d1986f1f30b07fd5108d9c0', 'hex') },
        { sha1: Buffer.from('9b054583eccc3422abd9da7b80c185853c1dd61d', 'hex') }
      ] as any);
  });

  test('Expect json array with SHA-1 hashes', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'GET',
      url: '/mc/v1/servers/blocked'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('public, max-age=120, s-maxage=120');

    const responseBody = response.json();
    expect(responseBody).toStrictEqual([
      '0caaf24ab1a0c33440c06afe99df986365b0781f',
      '8c7122d652cb7be22d1986f1f30b07fd5108d9c0',
      '9b054583eccc3422abd9da7b80c185853c1dd61d'
    ]);

    expect(databaseClient.serverBlocklist.findMany).toHaveBeenCalledTimes(1);
    expect(databaseClient.serverBlocklist.findMany).toHaveBeenCalledWith({ select: { sha1: true } });
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: '/mc/v1/servers/blocked'
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});

describe('/mc/v1/servers/blocked/known', () => {
  let databaseClient: DeepMockProxy<DatabaseClient>;

  beforeEach(() => {
    databaseClient = container.resolve(DatabaseClient) as DeepMockProxy<DatabaseClient>;
    databaseClient.serverBlocklist.findMany
      .mockResolvedValue([
        { sha1: Buffer.from('0caaf24ab1a0c33440c06afe99df986365b0781f', 'hex'), host: 'example.com' },
        { sha1: Buffer.from('8c7122d652cb7be22d1986f1f30b07fd5108d9c0', 'hex'), host: '*.example.com' },
        { sha1: Buffer.from('9b054583eccc3422abd9da7b80c185853c1dd61d', 'hex'), host: null }
      ]);
  });

  test('Expect json SHA-1 hashes as keys and host as values', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'GET',
      url: '/mc/v1/servers/blocked/known'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('public, max-age=120, s-maxage=120');

    const responseBody = response.json();
    expect(responseBody).toStrictEqual({
      '0caaf24ab1a0c33440c06afe99df986365b0781f': 'example.com',
      '8c7122d652cb7be22d1986f1f30b07fd5108d9c0': '*.example.com'
    });

    expect(databaseClient.serverBlocklist.findMany).toHaveBeenCalledTimes(1);
    expect(databaseClient.serverBlocklist.findMany).toHaveBeenCalledWith({ where: { host: { not: null } } });
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: '/mc/v1/servers/blocked/known'
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});

describe('/mc/v1/servers/blocked/check', () => {
  test.each([
    ['example.com', { 'example.com': true, '*.example.com': true, '*.com': false }],
    ['example.com:25565', { 'example.com': true, '*.example.com': true, '*.com': false }],
    ['lobby.mc.example.com', {
      '*.lobby.mc.example.com': false,
      'lobby.mc.example.com': false,
      '*.mc.example.com': false,
      'mc.example.com': false,
      '*.example.com': true,
      'example.com': true,
      '*.com': false
    }],
    ['1.1.1.1', { '1.1.1.1': false, '1.1.1.*': false, '1.1.*': false, '1.*': false }],
    ['1.1.1.1:25565', { '1.1.1.1': false, '1.1.1.*': false, '1.1.*': false, '1.*': false }],
    ['2606:4700:4700::1111', { '2606:4700:4700::1111': false }]
  ])('Expect hosts to be hashed and checked: %j', async (host: string, expected: { [key: string]: boolean }) => {
    const databaseClient = container.resolve(DatabaseClient) as DeepMockProxy<DatabaseClient>;
    databaseClient.serverBlocklist.findMany
      .mockResolvedValue([
        { sha1: Buffer.from('0caaf24ab1a0c33440c06afe99df986365b0781f', 'hex'), host: 'example.com' },
        { sha1: Buffer.from('8c7122d652cb7be22d1986f1f30b07fd5108d9c0', 'hex'), host: '*.example.com' },
        { sha1: Buffer.from('9b054583eccc3422abd9da7b80c185853c1dd61d', 'hex'), host: null }
      ]);
    databaseClient.$transaction.mockImplementation((callback) => callback(databaseClient));
    databaseClient.serverBlocklistHostHashes.findMany.mockResolvedValue([{ host: 'example.com' }, { host: '*.example.com' }] as any);

    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'GET',
      url: '/mc/v1/servers/blocked/check?host=' + encodeURIComponent(host)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expected);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('public, max-age=120, s-maxage=120');

    expect(databaseClient.serverBlocklist.findMany).toHaveBeenCalledTimes(1);
    expect(databaseClient.serverBlocklist.findMany).toHaveBeenCalledWith({ select: { sha1: true } });

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expect(databaseClient.serverBlocklistHostHashes.findMany).toHaveBeenCalledTimes(1);
    expect(databaseClient.serverBlocklistHostHashes.findMany).toHaveBeenCalledWith({
      where: { sha1: { in: expect.any(Array) } },
      select: { host: true }
    });

    expect(databaseClient.serverBlocklistHostHashes.createMany).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['https://example.com'],
    ['com'],
    ['de'],
    ['com:1234'],
    ['1234.10.10.10'],
    ['1234.10.10.10:1234'],
    ['2001:db8:a0b:12f0::::0:1']
  ])('Expect invalid host to be rejected: %j', async (host: string) => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'GET',
      url: '/mc/v1/servers/blocked/check?host=' + encodeURIComponent(host)
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid query parameters',
      details: [{ param: 'host', condition: 'A valid IPv4, IPv6 or domain' }]
    });

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  test('Expect 400 Bad Request without host parameter', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'GET',
      url: '/mc/v1/servers/blocked/check'
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'Bad Request',
      message: 'Missing or invalid query parameters',
      details: [{ param: 'host', condition: 'host.length > 0' }]
    });
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  test('Expect 405 Method Not Allowed on POST', async () => {
    const fastifyWebServer = container.resolve(FastifyWebServer);
    const fastify = (fastifyWebServer as any).fastify as FastifyInstance;
    const response = await fastify.inject({
      method: 'POST',
      url: '/mc/v1/servers/blocked/check'
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });
});
