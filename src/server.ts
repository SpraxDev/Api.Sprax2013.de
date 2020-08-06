import express = require('express');
import morgan = require('morgan');

import { minecraftExpressRouter } from './routes/minecraft';
import { skindbExpressRouter } from './routes/skindb';
import { statusExpressRouter } from './routes/status';

import { cfg, webAccessLogStream } from '.';
import { ErrorBuilder, ApiError, HttpError } from './utils/utils';
import { skindbFrontendExpressRouter } from './routes/skindb_frontend';

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

// Force the last query param instead of allowing multiple as string[]
app.use((req, _res, next) => {
  for (const key in req.query) {
    if (req.query.hasOwnProperty(key)) {
      const value = req.query[key];

      if (Array.isArray(value)) {
        let newValue = value.pop();

        if (typeof newValue != 'undefined') {
          req.query[key] = newValue;
        } else {
          delete req.query[key];
        }
      }
    }
  }

  next();
});

// Default response headers
app.use((_req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'User-Agent,Authorization,If-None-Match,Content-Type,If-Unmodified-Since',

    'Cache-Control': 'public, s-maxage=30, max-age=30'
  });

  next();
});

/* Prepare Request */
app.use(express.raw({ type: ['image/png'], limit: '3MB' }));  // recode to send custom error messages
app.use(express.json());  // TODO: Throws 500 http status code on invalid json instead of 400

/* Webserver routes */
app.use('/mojang', (_req, _res, next) => next(new ApiError('Please use /mc instead of /mojang', 410)));  // Temporary
app.use('/hems', (_req, _res, next) => next(new ApiError(`Gone forever or as long as I desire`, 410)));  // Temporary

app.use('/status', statusExpressRouter);
app.use('/mc', minecraftExpressRouter);
app.use('/skindb/frontend', skindbFrontendExpressRouter);
app.use('/skindb', skindbExpressRouter);

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

  if (err.httpCode >= 500 && err.httpCode != 503 && !err.logged) {
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