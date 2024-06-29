import ProtocolViolationError from '../error/ProtocolViolationError.js';

export default class MinecraftProtocolReader {
  private readonly VAR_INT_SEGMENT_BITS = 0x7f;
  private readonly VAR_INT_CONTINUE_BIT = 0x80;

  private readonly data: Readonly<Buffer>;
  private offset = 0;

  constructor(data: Readonly<Buffer>) {
    this.data = data;
  }

  get bytesLeft(): number {
    return this.data.byteLength - this.offset;
  }

  readVarInt(): number {
    let value = 0;
    let position = 0;

    while (true) {
      const currentByte = this.readByte();
      value |= (currentByte & this.VAR_INT_SEGMENT_BITS) << position;

      if ((currentByte & this.VAR_INT_CONTINUE_BIT) === 0) {
        break;
      }

      position += 7;
      if (position >= 32) {
        throw new ProtocolViolationError('VarInt is too big');
      }
    }

    return value;
  }

  readString(): string {
    const length = this.readVarInt();
    if (this.bytesLeft < length) {
      throw new ProtocolViolationError('Unexpected end of data while reading string');
    }

    const stringBuffer = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return stringBuffer.toString('utf-8');
  }

  private readByte(): number {
    if (this.offset >= this.data.byteLength) {
      throw new ProtocolViolationError('Unexpected end of data while reading byte');
    }
    return this.data.readUInt8(this.offset++);
  }
}
