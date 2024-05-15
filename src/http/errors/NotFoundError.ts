import HttpError from './HttpError.js';

export default class NotFoundError extends HttpError {
  constructor(httpErrorMessage: string) {
    super(404, httpErrorMessage);
  }
}
