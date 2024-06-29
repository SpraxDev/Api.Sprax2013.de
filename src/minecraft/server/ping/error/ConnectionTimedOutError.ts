import ServerStatusPingError from './ServerStatusPingError.js';

export default class ConnectionTimedOutError extends ServerStatusPingError {
  constructor() {
    super('Reached max idle timeout – closing socket...');
  }
}
