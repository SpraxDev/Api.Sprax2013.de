import IpAddrJs from 'ipaddr.js';
import Dns from 'node:dns/promises';
import Net from 'node:net';
import { injectable } from 'tsyringe';
import HostNotResolvableError from './HostNotResolvableError.js';
import ResolvedToNonUnicastIpError from './ResolvedToNonUnicastIpError.js';

@injectable()
export default class ServerHostResolver {
  async resolve(host: string, port: number): Promise<[string, number]> {
    const [resolvedHost, resolvedPort] = await this.performResolve(host, port);

    const parsedHost = IpAddrJs.parse(resolvedHost);
    if (parsedHost.range() !== 'unicast') {
      throw new ResolvedToNonUnicastIpError(parsedHost.range());
    }

    return [parsedHost.toNormalizedString(), resolvedPort];
  }

  private async performResolve(host: string, port: number): Promise<[string, number]> {
    if (Net.isIP(host) !== 0) {
      return [host, port];
    }

    let hostToResolve = host;
    let resolvedPort = port;

    try {
      const srvRecords = await Dns.resolveSrv(`_minecraft._tcp.${host}`);
      if (srvRecords.length > 0) {
        hostToResolve = srvRecords[0].name;
        resolvedPort = srvRecords[0].port;
      }
    } catch (err: any) {
      if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
        throw err;
      }
    }

    // FIXME: causes trouble if the machine does not support IPv6 connections
    try {
      const ip6 = await Dns.resolve6(hostToResolve);
      if (ip6.length > 0) {
        return [ip6[0], resolvedPort];
      }
    } catch (err: any) {
      if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
        throw err;
      }
    }

    try {
      const ip4 = await Dns.resolve4(hostToResolve);
      if (ip4.length > 0) {
        return [ip4[0], resolvedPort];
      }
    } catch (err: any) {
      if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
        throw err;
      }
    }

    throw new HostNotResolvableError(hostToResolve);
  }
}
