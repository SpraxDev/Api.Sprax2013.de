import express = require('express');
import morgan = require('morgan');

import { cfg, runningInProduction, webAccessLogStream } from '.';
import { minecraftExpressRouter } from './routes/minecraft';
import { statusExpressRouter } from './routes/status';
import { ServerTiming } from './utils/ServerTiming';
import { ApiError, ErrorBuilder, HttpError } from './utils/utils';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', cfg.trustProxy);

/* Logging webserver request */
app.use(morgan(cfg.logging.accessLogFormat, {stream: webAccessLogStream}));
app.use(morgan('dev', runningInProduction ? {skip: (_req, res) => res.statusCode < 500} : undefined));

// Prepare Server-Timings
app.use(ServerTiming.getExpressMiddleware(true /*!runningInProduction*/));  // TODO: remove debug

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
app.use(express.raw({type: ['image/png'], limit: '3MB'}));  // recode to send custom error messages
app.use(express.json());  // TODO: Throws 500 http status code on invalid json instead of 400

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
  } else if (!(err instanceof ApiError)) {
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