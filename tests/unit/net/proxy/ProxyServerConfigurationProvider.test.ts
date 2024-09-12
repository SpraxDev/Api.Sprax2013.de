import { jest } from '@jest/globals';
import ProxyServerConfigurationProvider from '../../../../src/net/proxy/ProxyServerConfigurationProvider.js';
import SentrySdk from '../../../../src/SentrySdk.js';

describe('ProxyServerConfigurationProvider', () => {
  test('Provide for empty proxy server list', () => {
    const configProvider = new ProxyServerConfigurationProvider([]);

    expect(configProvider.getProxyServers()).toEqual([]);
    expect(configProvider.getSocksProxyServers()).toEqual([]);
  });

  test('Provide for proxy with custom name', () => {
    const configProvider = new ProxyServerConfigurationProvider(['https://proxy.example.com/?name=test']);

    expect(configProvider.getProxyServers()).toEqual([
      {
        simplifiedUri: 'https://proxy.example.com/',
        displayName: 'test',
        username: '',
        password: ''
      }
    ]);
    expect(configProvider.getSocksProxyServers()).toEqual([]);
  });

  test.each(['http', 'https'])('Provide for one %s proxy server', (protocol: string) => {
    const configProvider = new ProxyServerConfigurationProvider([`${protocol}://proxy.example.com`]);

    expect(configProvider.getProxyServers()).toEqual([
      {
        simplifiedUri: `${protocol}://proxy.example.com/`,
        displayName: `${protocol}://proxy.example.com/`,
        username: '',
        password: ''
      }
    ]);
    expect(configProvider.getSocksProxyServers()).toEqual([]);
  });

  test.each([5, 4])('Provide for one socks%d proxy server', (socksVersion: number) => {
    const configProvider = new ProxyServerConfigurationProvider([`socks${socksVersion}://user:pass@proxy.example.com:8899`]);

    const expectedProxies = [
      {
        simplifiedUri: `socks${socksVersion}://proxy.example.com:8899/`,
        displayName: `socks${socksVersion}://proxy.example.com:8899/`,
        username: 'user',
        password: 'pass',
        socksProxyOptions: {
          version: socksVersion,
          host: 'proxy.example.com',
          port: 8899,
          timeout: 3000
        }
      }
    ];
    expect(configProvider.getProxyServers()).toEqual(expectedProxies);
    expect(configProvider.getSocksProxyServers()).toEqual(expectedProxies);
  });

  test('Provide for multiple proxy servers', () => {
    const configProvider = new ProxyServerConfigurationProvider([
      'http://proxy0.example.com:8080',
      'https://proxy1.example.com',
      'socks5://[::1]:1234',
      'socks4://user:pass@proxy2.example.com:8899'
    ]);

    const expectedHttpProxies = [
      {
        simplifiedUri: 'http://proxy0.example.com:8080/',
        displayName: 'http://proxy0.example.com:8080/',
        username: '',
        password: ''
      },
      {
        simplifiedUri: 'https://proxy1.example.com/',
        displayName: 'https://proxy1.example.com/',
        username: '',
        password: ''
      }
    ];
    const expectedSocksProxies = [
      {
        simplifiedUri: 'socks5://[::1]:1234/',
        displayName: 'socks5://[::1]:1234/',
        username: '',
        password: '',
        socksProxyOptions: {
          version: 5,
          host: '::1',
          port: 1234,
          timeout: 3000
        }
      },
      {
        simplifiedUri: 'socks4://proxy2.example.com:8899/',
        displayName: 'socks4://proxy2.example.com:8899/',
        username: 'user',
        password: 'pass',
        socksProxyOptions: {
          version: 4,
          host: 'proxy2.example.com',
          port: 8899,
          timeout: 3000
        }
      }
    ];

    expect(configProvider.getProxyServers().length).toBe(4);
    expect(configProvider.getSocksProxyServers().length).toBe(2);

    for (const expectedProxy of [...expectedHttpProxies, ...expectedSocksProxies]) {
      expect(configProvider.getProxyServers()).toContainEqual(expectedProxy);
    }
    for (const expectedProxy of expectedSocksProxies) {
      expect(configProvider.getSocksProxyServers()).toContainEqual(expectedProxy);
    }
  });

  test('Order of provided proxy servers is randomized', () => {
    const inputProxies = [];
    for (let i = 1; i <= 100; i++) {
      inputProxies.push(`socks5://proxy${i}.example.com`);
    }

    const configProvider = new ProxyServerConfigurationProvider(inputProxies);
    expect(configProvider.getProxyServers().length).toBe(100);
    expect(configProvider.getSocksProxyServers().length).toBe(100);

    expect(configProvider.getProxyServers().map((proxy) => proxy.simplifiedUri)).not.toEqual(inputProxies);
    expect(inputProxies[0]).toBe('socks5://proxy1.example.com');  // input array wasn't modified
  });

  test.each(['socks2', 'ftp', 'ssh'])('Throws error for unsupported protocol: %s', (protocol: string) => {
    expect(() => new ProxyServerConfigurationProvider([`${protocol}://proxy.example.com`]))
      .toThrow(`Proxy server URI uses an unsupported protocol: ${protocol}`);
  });

  test('Throws error for proxy server with path', () => {
    expect(() => new ProxyServerConfigurationProvider(['https://proxy.example.com/path']))
      .toThrow(`Proxy server URL must not contain a path: https://proxy.example.com/path`);
  });

  test('Warning is logged for duplicate proxy server URIs', () => {
    jest.spyOn(SentrySdk, 'logAndCaptureWarning').mockReturnValue(undefined);

    const configProvider = new ProxyServerConfigurationProvider([
      'https://proxy1.example.com',
      'https://proxy2.example.com',
      'https://user1:pass1@proxy1.example.com',
      'https://proxy1.example.com'
    ]);
    expect(configProvider.getProxyServers().length).toBe(4);

    expect(SentrySdk.logAndCaptureWarning).toHaveBeenCalledTimes(2);
    expect(SentrySdk.logAndCaptureWarning).toHaveBeenNthCalledWith(1, `Proxy server 'https://proxy1.example.com/' is configured multiple times`);
    expect(SentrySdk.logAndCaptureWarning).toHaveBeenNthCalledWith(2, `Proxy server 'https://proxy1.example.com/' is configured multiple times`);
  });

  test('Warning is logged for duplicate proxy server names', () => {
    jest.spyOn(SentrySdk, 'logAndCaptureWarning').mockReturnValue(undefined);

    const configProvider = new ProxyServerConfigurationProvider([
      'https://proxy1.example.com?name=test',
      'https://proxy2.example.com?name=proxy2',
      'https://user1:pass1@proxy3.example.com?name=test',
      'https://proxy4.example.com?name=test'
    ]);
    expect(configProvider.getProxyServers().length).toBe(4);

    expect(SentrySdk.logAndCaptureWarning).toHaveBeenCalledTimes(2);
    expect(SentrySdk.logAndCaptureWarning).toHaveBeenNthCalledWith(1, `Proxy server name 'test' is configured multiple times`);
    expect(SentrySdk.logAndCaptureWarning).toHaveBeenNthCalledWith(2, `Proxy server name 'test' is configured multiple times`);
  });
});
