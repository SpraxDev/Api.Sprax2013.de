export default class MinecraftPacketBuilder {
  private readonly VAR_INT_SEGMENT_BITS = 0x7f;
  private readonly VAR_INT_CONTINUE_BIT = 0x80;

  private readonly payloadBuffer: number[] = [];

  writeVarInt(value: number): this {
    while (true) {
      if ((value & ~this.VAR_INT_SEGMENT_BITS) === 0) {
        this.payloadBuffer.push(value);
        break;
      }
      this.payloadBuffer.push((value & this.VAR_INT_SEGMENT_BITS) | this.VAR_INT_CONTINUE_BIT);
      value >>>= 7;
    }

    return this;
  }

  writeUnsignedShort(value: number): this {
    this.payloadBuffer.push(value >> 8, value & 0xff);
    return this;
  }

  writeString(value: string): this {
    const valueBytes = Buffer.from(value, 'utf-8');
    this.writeVarInt(valueBytes.byteLength);
    this.payloadBuffer.push(...valueBytes);

    return this;
  }

  buildAndClear(): Buffer {
    const payloadLength = this.payloadBuffer.length;
    this.writeVarInt(payloadLength);

    const packet = Buffer.concat([
      Buffer.from(this.payloadBuffer.slice(payloadLength)), // Packet length
      Buffer.from(this.payloadBuffer.slice(0, payloadLength)) // Packet data
    ]);
    this.clear();
    return packet;
  }

  clear(): void {
    this.payloadBuffer.length = 0;
  }
}
