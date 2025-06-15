import { ProxyServer } from './ProxyServerConfigurationProvider.js';

export default class RoundRobinProxyPool<T extends ProxyServer> {
  private readonly proxies: T[] = [];
  private nextProxyIndex = 0;

  constructor(proxyServers: T[]) {
    this.proxies = proxyServers;
  }

  get proxyCount(): number {
    return this.proxies.length;
  }

  getAllProxies(): Readonly<T[]> {
    return this.proxies;
  }

  selectNextProxy(skipIpv6Only: boolean): T {
    if (this.proxies.length === 0) {
      throw new Error('No proxies available');
    }

    let startIndex = this.nextProxyIndex;
    do {
      const proxy = this.proxies[this.nextProxyIndex];
      this.nextProxyIndex = (this.nextProxyIndex + 1) % this.proxies.length;
      if (!(skipIpv6Only && proxy.ipv6Only)) {
        return proxy;
      }
    } while (skipIpv6Only && startIndex !== this.nextProxyIndex);

    throw new Error(`No suitable proxy found (skipIpv6Only=${skipIpv6Only})`);
  }
}
