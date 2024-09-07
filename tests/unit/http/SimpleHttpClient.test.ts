import { jest } from '@jest/globals';
import * as Undici from 'undici';
import ResolvedToNonUnicastIpError from '../../../src/http/dns/errors/ResolvedToNonUnicastIpError.js';
import SimpleHttpClient from '../../../src/http/clients/SimpleHttpClient.js';

let originalAgent: Undici.Agent;
let mockAgent: Undici.MockAgent;
let httpClient: SimpleHttpClient;

beforeEach(() => {
  (SimpleHttpClient as any).DEBUG_LOGGING = false;

  mockAgent = new Undici.MockAgent();
  mockAgent.disableNetConnect();

  httpClient = new SimpleHttpClient();
  originalAgent = (httpClient as any).agent;
  (httpClient as any).agent = mockAgent;

  const mockPool = mockAgent.get('https://test-hostname');
  mockPool
    .intercept({
      path: '/',
      method: 'GET'
    })
    .reply(200, 'OK', { headers: { 'content-type': 'text/plain', 'x-test-header': 'test-value' } });
  mockPool
    .intercept({
      path: '/json',
      method: 'GET'
    })
    .reply(200, { ok: true });
  mockPool
    .intercept({
      path: '/with-headers',
      method: 'GET',
      headers: {
        authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
        'user-agent': 'Test-User-Agent'
      }
    })
    .reply(200, 'OK');
  mockPool
    .intercept({
      path: '/with-query',
      method: 'GET',
      query: {
        param: 'value'
      }
    })
    .reply(200, 'OK');
});

describe('SimpleHttpClient GET requests', () => {
  test('Returned text response is correct', async () => {
    const response = await httpClient.get('https://test-hostname/');
    expect(response.statusCode).toBe(200);
    expect(response.ok).toBe(true);

    expect(response.body).toEqual(Buffer.from('OK'));
    expect(response.parseBodyAsText()).toBe('OK');

    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('x-test-header')).toBe('test-value');
    expect(response.headers.size).toBe(2);

    expect(response.getHeader('content-type')).toBe('text/plain');
    expect(response.getHeader('Content-Type')).toBe('text/plain');
    expect(response.getHeader('unknown')).toBeNull();

    expect(() => response.parseBodyAsJson()).toThrow();
  });

  test('Returned json response is correct', async () => {
    const expectedBody = { ok: true };

    const response = await httpClient.get('https://test-hostname/json');
    expect(response.statusCode).toBe(200);
    expect(response.ok).toBe(true);

    expect(response.body).toEqual(Buffer.from(JSON.stringify(expectedBody)));
    expect(response.parseBodyAsText()).toBe(JSON.stringify(expectedBody));
    expect(response.parseBodyAsJson()).toEqual(expectedBody);

    expect(response.headers.size).toBe(0);
  });

  test('Sending request with headers can overwrite default headers', async () => {
    const response = await httpClient.get('https://test-hostname/with-headers', {
      headers: {
        'Authorization': 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
        'User-Agent': 'Test-User-Agent'
      }
    });

    expect(response.statusCode).toBe(200);
  });

  test('Sending request with headers can overwrite default headers', async () => {
    const response = await httpClient.get('https://test-hostname/with-query', {
      query: {
        param: 'value'
      }
    });

    expect(response.statusCode).toBe(200);
  });

  test.each([
    ['0.0.0.0'],
    ['10.0.0.1'],
    ['172.16.0.1'],
    ['192.168.0.1'],
    ['224.0.0.1'],
    ['127.0.0.1'],
    ['127.0.0.2'],
    ['[fc00::1]'],
    ['[fd00::1]'],
    ['[ff00::1]'],
    ['[::1]'],

    ['spraxapi-automated-test-private-ipv4.sprax.me'],
    ['spraxapi-automated-test-private-ipv6.sprax.me']
  ])('Throws error when connecting to non-public IP: %s', async (hostname: string) => {
    (httpClient as any).agent = originalAgent;

    await expect(httpClient.get(`https://${hostname}`)).rejects.toThrow(ResolvedToNonUnicastIpError);
  });

  test('Debug messages are logged', async () => {
    (SimpleHttpClient as any).DEBUG_LOGGING = true;
    jest.spyOn(console, 'debug').mockReturnValue(undefined);

    await httpClient.get('https://test-hostname');
    expect(console.debug).toHaveBeenCalledTimes(2);
  });
});
