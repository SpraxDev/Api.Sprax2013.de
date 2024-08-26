export abstract class ApiV1HttpError extends Error {
  protected constructor(
    public readonly httpStatusCode: number,
    public readonly httpErrorMessage: string
  ) {
    super(`[${httpStatusCode}] ${httpErrorMessage}`);
  }

  abstract createResponseBody(): any;
}

export class ApiV1BadRequestError extends ApiV1HttpError {
  constructor(
    httpErrorMessage: string,
    private readonly details?: any[]
  ) {
    super(400, httpErrorMessage);
  }

  createResponseBody(): any {
    return {
      error: 'Bad Request',
      message: this.httpErrorMessage,
      details: this.details
    };
  }

  static missingOrInvalidUrlParameter(param: string, condition: string): ApiV1BadRequestError {
    return new ApiV1BadRequestError('Missing or invalid url parameters', [{ param: param, condition: condition }]);
  }

  static missingOrInvalidQueryParameter(param: string, condition: string): ApiV1BadRequestError {
    return new ApiV1BadRequestError('Missing or invalid query parameters', [{ param: param, condition: condition }]);
  }

  static missingOrInvalidBody(param:string, condition:string): ApiV1BadRequestError {
    return new ApiV1BadRequestError('Missing or invalid body', [{ param: param, condition: condition }]);
  }
}

export class ApiV1NotFoundError extends ApiV1HttpError {
  constructor(httpErrorMessage: string) {
    super(404, httpErrorMessage);
  }

  createResponseBody(): any {
    return {
      error: 'Not Found',
      message: this.httpErrorMessage
    };
  }

  static profileForGivenUserNotFound(): ApiV1NotFoundError {
    return new ApiV1NotFoundError('Profile for given user');
  }

  static uuidForGivenUsernameNotFound(): ApiV1NotFoundError {
    return new ApiV1NotFoundError('UUID for given username');
  }
}
