import HttpError from './HttpError.js';

export default class BadRequestError extends HttpError {
  constructor(httpErrorMessage: string) {
    super(400, httpErrorMessage);
  }
}
