import { singleton } from 'tsyringe';
import type { PingResult } from './AbstractMinecraftServerPing.js';
import ProtocolViolationError from './error/ProtocolViolationError.js';
import SocketClosedError from './error/SocketClosedError.js';
import LatestServerStatusPinger from './LatestServerStatusPinger.js';
import LegacyServerStatusPinger from './LegacyServerStatusPinger.js';
import ServerHostResolver from './resolve/ServerHostResolver.js';

@singleton()
export default class MinecraftServerStatusPinger {
  constructor(
    private readonly serverHostResolver: ServerHostResolver
  ) {
  }

  async ping(host: string, port: number): Promise<PingResult> {
    const [hostToPing, portToPing] = await this.serverHostResolver.resolve(host, port);

    try {
      return await new LatestServerStatusPinger(host, port, hostToPing, portToPing).ping();
    } catch (err: any) {
      if (err instanceof ProtocolViolationError || err.code === 'ECONNRESET') {
        try {
          return await new LegacyServerStatusPinger(host, port, hostToPing, portToPing).ping();
        } catch (err: any) {
          if (err instanceof SocketClosedError) {
            await this.sleep(4000);
            return await new LegacyServerStatusPinger(host, port, hostToPing, portToPing).ping();
          }
        }
      }

      throw err;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
