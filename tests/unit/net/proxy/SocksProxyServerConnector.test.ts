import { jest } from '@jest/globals';
import { SocksProxyServer } from '../../../../src/net/proxy/ProxyServerConfigurationProvider.js';

const socksClientCreateConnection = jest.fn<any>().mockResolvedValue({ socket: 'test-socket' });
jest.mock('socks', () => ({
  SocksClient: {
    createConnection: socksClientCreateConnection
  }
}));

describe('SocksProxyServerConnector', () => {
  test.each([
    ['#createConnection uses the socks module to open a connection', 1080],
    ['#createConnection uses default port 1080 if not specified', undefined]
  ])('%s', async (_testName: string, proxyPort: number | undefined) => {
    const proxyServer: SocksProxyServer = {
      displayName: 'test',
      simplifiedUri: 'socks5://127.0.0.1:1080',
      username: 'user1',
      password: 'pass1',
      socksProxyOptions: {
        version: 5,
        host: '127.0.0.1',
        port: proxyPort,
        timeout: 500
      }
    };

    const SocksProxyServerConnector = await import('../../../../src/net/proxy/SocksProxyServerConnector.js');
    await expect(new SocksProxyServerConnector.default().createConnection(proxyServer, '127.0.0.2', 8080)).resolves.toBe('test-socket');
    expect(socksClientCreateConnection).toHaveBeenCalledTimes(1);
    expect(socksClientCreateConnection).toHaveBeenCalledWith({
      command: 'connect',
      proxy: {
        type: 5,
        host: '127.0.0.1',
        port: 1080,
        userId: 'user1',
        password: 'pass1'
      },
      timeout: 500,
      destination: {
        host: '127.0.0.2',
        port: 8080
      }
    });
  });
});
