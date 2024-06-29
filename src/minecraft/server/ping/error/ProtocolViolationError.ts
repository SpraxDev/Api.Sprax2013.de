import ServerStatusPingError from './ServerStatusPingError.js';

export default class ProtocolViolationError extends ServerStatusPingError {
  constructor(message: string) {
    super(message);
  }
}
