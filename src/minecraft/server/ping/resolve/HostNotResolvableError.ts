export default class HostNotResolvableError extends Error {
  constructor(host: string) {
    super(`Unable to resolve the given host: ${host}`);
  }
}
