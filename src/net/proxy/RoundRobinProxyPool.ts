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

  selectNextProxy(): T {
    if (this.proxies.length === 0) {
      throw new Error('No proxies available');
    }

    const proxy = this.proxies[this.nextProxyIndex];
    this.nextProxyIndex = (this.nextProxyIndex + 1) % this.proxies.length;
    return proxy;
  }
}
