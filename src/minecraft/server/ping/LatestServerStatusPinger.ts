import Net from 'node:net';
import AbstractMinecraftServerPing, { type PingResult } from './AbstractMinecraftServerPing.js';
import MinecraftPacketBuilder from './protocol/MinecraftPacketBuilder.js';
import MinecraftProtocolReader from './protocol/MinecraftProtocolReader.js';
import ProtocolViolationError from './error/ProtocolViolationError.js';

export default class LatestServerStatusPinger extends AbstractMinecraftServerPing {
  private readonly packetBuilder = new MinecraftPacketBuilder();

  private serverResponseBuffer = Buffer.alloc(0);
  private statusRequestSent = 0;

  constructor(host: string, port: number, resolvedIp: string, resolvedPort: number) {
    super(host, port, resolvedIp, resolvedPort);
  }

  protected onSocketConnected(socket: Net.Socket): void {
    const handshakePacket = this.packetBuilder
      .writeVarInt(0x00)  // Packet ID
      .writeVarInt(-1) // Protocol Version
      .writeString(this.host)
      .writeUnsignedShort(this.port)
      .writeVarInt(1) // Next State (status)
      .buildAndClear();

    socket.write(handshakePacket, () => {
      const statusRequestPacket = this.packetBuilder
        .writeVarInt(0x00)  // Packet ID
        .buildAndClear();
      socket.write(statusRequestPacket, () => this.statusRequestSent = Date.now());
    });
  }

  protected onSocketData(socket: Net.Socket, data: Buffer, resolve: (result: PingResult) => void): void {
    this.serverResponseBuffer = Buffer.concat([this.serverResponseBuffer, data]);

    // wait for the first VarInt (packet length)
    if (this.serverResponseBuffer.byteLength < 5) {
      return;
    }

    const protocolReader = new MinecraftProtocolReader(this.serverResponseBuffer);
    const packetLength = protocolReader.readVarInt();

    // wait for the whole packet
    if (protocolReader.bytesLeft < packetLength) {
      return;
    }
    const rtt = Date.now() - this.statusRequestSent;

    const packetId = protocolReader.readVarInt();
    if (packetId !== 0x00) {
      throw new ProtocolViolationError(`Expected packet ID 0x00 but got ${packetId}`);
    }

    const payload = protocolReader.readString();
    socket.destroy();

    resolve({
      rttInMs: rtt,
      resolvedIp: this.resolvedIp,
      status: JSON.parse(payload)
    });
  }
}
