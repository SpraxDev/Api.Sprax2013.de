export abstract class HttpError extends Error {
  protected constructor(
    public readonly httpStatusCode: number,
    public readonly httpErrorMessage: string
  ) {
    super(`[${httpStatusCode}] ${httpErrorMessage}`);
  }
}

export class BadRequestError extends HttpError {
  constructor(httpErrorMessage: string) {
    super(400, httpErrorMessage);
  }
}

export class NotFoundError extends HttpError {
  constructor(httpErrorMessage: string) {
    super(404, httpErrorMessage);
  }
}
