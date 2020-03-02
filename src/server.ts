import express = require('express');
import morgan = require('morgan');

import { minecraftExpressRouter } from './routes/minecraft';
import { skindbExpressRouter } from './routes/skindb';
import { ErrorBuilder, ApiError, HttpError } from './utils';

export const app = express();
app.disable('x-powered-by');

app.use(morgan('dev')); // DEBUG

app.use('/mojang', (_req, _res, next) => next(new ApiError('Please use /mc instad of /mojang', 410)));  // Temporary
app.use('/hems', (_req, _res, next) => next(new ApiError(`Gone forever or as log as I desire`, 410)));  // Temporary

app.use('/mc', minecraftExpressRouter);
app.use('/skindb', skindbExpressRouter);

app.use((_req, _res, next) => {
  next(new ErrorBuilder().notFound());
});

app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!err) {
    err = new ErrorBuilder().log('Called the error handler without an Error!').unknown();
  }

  if (!(err instanceof Error)) {
    err = new ErrorBuilder().log('Error handler got unknown err-object', err).unknown();
  } else if (err instanceof Error && !(err instanceof ApiError)) {
    err = ApiError.fromError(err);
  }

  if (err.httpCode >= 500 && !err.logged) {
    ApiError.log(err);
  }

  if (res.headersSent) return next(err);  // Calls express default handler

  res.status(err.httpCode)
    .send({
      error: HttpError.getName(err.httpCode) || err.httpCode,
      message: err.message,
      details: err.details
    });
});