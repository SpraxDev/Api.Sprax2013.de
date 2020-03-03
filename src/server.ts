import express = require('express');
import morgan = require('morgan');

import { minecraftExpressRouter } from './routes/minecraft';
import { statusExpressRouter } from './routes/status';

import { cfg, webAccessLogStream } from '.';
import { ErrorBuilder, ApiError, HttpError } from './utils';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', cfg.trustProxy);

/* Logging webserver request */
app.use(morgan(cfg.logging.accessLogFormat, { stream: webAccessLogStream }));
if (process.env.NODE_ENV == 'production') {
  app.use(morgan('dev', { skip: (_req, res) => res.statusCode < 500 }));
} else {
  app.use(morgan('dev'));
}

// Default response headers
app.use((_req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'User-Agent,Authorization,If-None-Match,Content-Type,If-Unmodified-Since',

    'Cache-Control': 'public, s-maxage=30, max-age=30'
  });

  next();
});

/* Webserver routes */
app.use('/mojang', (_req, _res, next) => next(new ApiError('Please use /mc instead of /mojang', 410)));  // Temporary
app.use('/hems', (_req, _res, next) => next(new ApiError(`Gone forever or as long as I desire`, 410)));  // Temporary

app.use('/status', statusExpressRouter);
app.use('/mc', minecraftExpressRouter);

/* Error handling */
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