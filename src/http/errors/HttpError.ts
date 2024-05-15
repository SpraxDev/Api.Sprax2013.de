export default abstract class HttpError extends Error {
  constructor(
    public readonly httpStatusCode: number,
    public readonly httpErrorMessage: string
  ) {
    super(`[${httpStatusCode}] ${httpErrorMessage}`);
  }
}
