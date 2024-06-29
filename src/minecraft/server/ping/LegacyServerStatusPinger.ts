import Net from 'node:net';
import AbstractMinecraftServerPing, { type PingResult } from './AbstractMinecraftServerPing.js';
import ProtocolViolationError from './error/ProtocolViolationError.js';

export default class LegacyServerStatusPinger extends AbstractMinecraftServerPing {
  private serverResponseBuffer = Buffer.alloc(0);
  private statusRequestSent = 0;

  constructor(host: string, port: number, resolvedIp: string, resolvedPort: number) {
    super(host, port, resolvedIp, resolvedPort);
  }

  protected onSocketConnected(socket: Net.Socket): void {
    const port = Buffer.alloc(4);
    port.writeInt32BE(this.resolvedPort);

    const hostname = Buffer.from(this.host, 'utf16le').swap16();

    const hostnameLength = Buffer.alloc(2);
    hostnameLength.writeInt16BE(this.host.length);

    const protocolHostnameAndPortBytes = Buffer.alloc(2);
    protocolHostnameAndPortBytes.writeInt16BE(7 + hostname.byteLength);

    socket.write(Buffer.from([
      0xFE, // Packet ID
      0x01, // ServerListPing Payload
      0xFA, // Packet ID for PluginMessage
      0x00, 0x0B, // Length of "MC|PingHost"
      ...Buffer.from('MC|PingHost', 'utf16le').swap16(),
      ...protocolHostnameAndPortBytes,
      0x7F, // (non-existing) protocol version
      ...hostnameLength,
      ...hostname,
      ...port
    ]), () => {
      this.statusRequestSent = Date.now();
    });
  }

  protected onSocketData(socket: Net.Socket, data: Buffer, resolve: (result: PingResult) => void): void {
    this.serverResponseBuffer = Buffer.concat([this.serverResponseBuffer, data]);
    // TODO: return, if not all data has been received yet

    if (this.serverResponseBuffer.byteLength <= 0) {
      throw new ProtocolViolationError('No data received from server');
    }
    const rttInMs = Date.now() - this.statusRequestSent;

    const payloadStartsAsExpected = this.serverResponseBuffer.readUInt8() === 0xFF && this.serverResponseBuffer.subarray(3, 9).equals(Buffer.from([0x00, 0xA7, 0x00, 0x31, 0x00, 0x00]));
    if (!payloadStartsAsExpected) {
      throw new ProtocolViolationError('Received invalid data from server');
    }
    this.serverResponseBuffer = this.serverResponseBuffer.subarray(9);

    this.serverResponseBuffer.swap16();
    resolve({
      rttInMs,
      resolvedIp: this.resolvedIp,
      legacyPing: true,

      status: this.parseStatusResponse()
    });

    socket.destroy();
  }

  private parseStatusResponse(): PingResult['status'] {
    const parsedData = this.serverResponseBuffer
      .toString('utf-16le')
      .split('\0');

    const protocolVersion = parseInt(parsedData[0], 10);
    const minecraftServerVersion = parsedData[1];
    const messageOfTheDay = parsedData[2];
    const currentPlayers = parseInt(parsedData[3], 10);
    const maxPlayers = parseInt(parsedData[4], 10);

    return {
      version: {
        protocol: protocolVersion,
        name: minecraftServerVersion
      },
      description: {
        text: messageOfTheDay
      },
      players: {
        online: currentPlayers,
        max: maxPlayers
      }
    };
  }
}
