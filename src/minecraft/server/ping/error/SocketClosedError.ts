import ServerStatusPingError from './ServerStatusPingError.js';

export default class SocketClosedError extends ServerStatusPingError {
  constructor() {
    super('Socket closed unexpectedly');
  }
}
