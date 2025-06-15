import { ProxyServer } from '../../../../src/net/proxy/ProxyServerConfigurationProvider.js';
import RoundRobinProxyPool from '../../../../src/net/proxy/RoundRobinProxyPool.js';

describe('RoundRobinProxyPool', () => {
  test('Using a empty proxy pool throws error', () => {
    const proxyPool = new RoundRobinProxyPool([]);

    expect(proxyPool.proxyCount).toBe(0);
    expect(() => proxyPool.selectNextProxy(false)).toThrow('No proxies available');
  });

  test('Calling #selectNextProxy(skipIpv6Only=false) always returns the next proxy and repeats from the start', () => {
    const proxyServers = [
      createProxyServerConfig('proxy1'),
      createProxyServerConfig('proxy2', true),
      createProxyServerConfig('proxy3'),
    ];
    const proxyPool = new RoundRobinProxyPool(proxyServers);

    expect(proxyPool.proxyCount).toBe(3);

    expect(proxyPool.selectNextProxy(false)).toBe(proxyServers[0]);
    expect(proxyPool.selectNextProxy(false)).toBe(proxyServers[1]);
    expect(proxyPool.selectNextProxy(false)).toBe(proxyServers[2]);
    expect(proxyPool.selectNextProxy(false)).toBe(proxyServers[0]);
  });

  test('Calling #selectNextProxy(skipIpv6Only=true) always returns the next proxy and repeats from the start', () => {
    const proxyServers = [
      createProxyServerConfig('proxy1'),
      createProxyServerConfig('proxy2', true),
      createProxyServerConfig('proxy3'),
    ];
    const proxyPool = new RoundRobinProxyPool(proxyServers);

    expect(proxyPool.proxyCount).toBe(3);

    expect(proxyPool.selectNextProxy(true)).toBe(proxyServers[0]);
    expect(proxyPool.selectNextProxy(true)).toBe(proxyServers[2]);
    expect(proxyPool.selectNextProxy(true)).toBe(proxyServers[0]);
    expect(proxyPool.selectNextProxy(true)).toBe(proxyServers[2]);
  });

  test('Calling #selectNextProxy(skipIpv6Only=true) throws Error if only ipv6 proxies exist', () => {
    const proxyServers = [
      createProxyServerConfig('proxy1', true),
      createProxyServerConfig('proxy2', true),
      createProxyServerConfig('proxy3', true),
    ];
    const proxyPool = new RoundRobinProxyPool(proxyServers);

    expect(proxyPool.proxyCount).toBe(3);
    expect(() => proxyPool.selectNextProxy(true)).toThrow(`No suitable proxy found (skipIpv6Only=true)`);
  });
});

function createProxyServerConfig(name: string, ipv6Only = false): ProxyServer {
  return {
    displayName: name,
    simplifiedUri: 'socks5://' + name,
    username: '',
    password: '',
    ipv6Only,
  };
}
