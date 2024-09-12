import { ProxyServer } from '../../../../src/net/proxy/ProxyServerConfigurationProvider.js';
import RoundRobinProxyPool from '../../../../src/net/proxy/RoundRobinProxyPool.js';

describe('RoundRobinProxyPool', () => {
  test('Using a empty proxy pool throws error', () => {
    const proxyPool = new RoundRobinProxyPool([]);

    expect(proxyPool.proxyCount).toBe(0);
    expect(() => proxyPool.selectNextProxy()).toThrow('No proxies available');
  });

  test('Calling #selectNextProxy() always returns the same proxy', () => {
    const proxyServers = [
      createProxyServerConfig('proxy1'),
      createProxyServerConfig('proxy2'),
      createProxyServerConfig('proxy3')
    ];
    const proxyPool = new RoundRobinProxyPool(proxyServers);

    expect(proxyPool.proxyCount).toBe(3);

    expect(proxyPool.selectNextProxy()).toBe(proxyServers[0]);
    expect(proxyPool.selectNextProxy()).toBe(proxyServers[1]);
    expect(proxyPool.selectNextProxy()).toBe(proxyServers[2]);
    expect(proxyPool.selectNextProxy()).toBe(proxyServers[0]);
  });
});

function createProxyServerConfig(name: string): ProxyServer {
  return {
    displayName: name,
    simplifiedUri: 'socks5://' + name,
    username: '',
    password: ''
  };
}
