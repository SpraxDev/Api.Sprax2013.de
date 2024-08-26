import { BadRequestError, NotFoundError } from './HttpErrors.js';

export class ApiV1BadRequestError extends BadRequestError {
  constructor(
    httpErrorMessage: string,
    private readonly details?: any[]
  ) {
    super(httpErrorMessage);
  }

  createResponseBody(): Record<string, any> {
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

  static missingOrInvalidBody(param: string, condition: string): ApiV1BadRequestError {
    return new ApiV1BadRequestError('Missing or invalid body', [{ param: param, condition: condition }]);
  }
}

export class ApiV1NotFoundError extends NotFoundError {
  constructor(httpErrorMessage: string) {
    super(httpErrorMessage);
  }

  createResponseBody(): Record<string, any> {
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
