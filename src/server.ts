import express = require('express');
import morgan = require('morgan');

import { Pool } from 'pg';
import { cfg, dbCfg, runningInProduction, webAccessLogStream } from '.';
import { minecraftExpressRouter } from './routes/minecraft';
import { statusExpressRouter } from './routes/status';
import { ServerTiming } from './utils/ServerTiming';
import { ApiError, ErrorBuilder, HttpError } from './utils/utils';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', cfg.trustProxy);

/* Logging webserver request to database */
if (cfg.logging.database) {
  const metricsPool = new Pool({
    host: dbCfg.host,
    port: dbCfg.port,
    user: dbCfg.user,
    password: dbCfg.password,
    database: cfg.logging.database,
    ssl: dbCfg.ssl ? {rejectUnauthorized: false} : false,
    max: 2,

    idleTimeoutMillis: 10 * 60 * 1000
  });

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();

    const orgSend = res.send;
    res.send = (body) => {
      res.send = orgSend;  // #send(body) might call itself with another body
      res.send.call(res, body); // call original #send(body) and let it set all the headers

      const millis = Number(process.hrtime.bigint() - start) * 0.000001;

      metricsPool.connect()
          .then(async (client): Promise<void> => {
            try {
              const countryCode = req.get('CF-IPCountry') != 'XX' ? req.get('CF-IPCountry') : null;
              const userAgentStr = req.get('User-Agent') ?? '';
              let userAgentId;

              const dbRes = await client.query('SELECT id FROM user_agents WHERE name =$1;', [userAgentStr]);
              if (dbRes.rows.length > 0) {
                userAgentId = dbRes.rows[0].id as string;
              } else {
                userAgentId = (await client.query('INSERT INTO user_agents(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET id=user_agents.id RETURNING id;', [userAgentStr])).rows[0].id as string;
              }

              await client.query('INSERT INTO sprax_api(remote_addr,country,method,path,status,body_bytes,res_time_millis,agent,instance,time)' +
                  'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP);',
                  [req.ip ?? '127.0.0.1', countryCode, req.method, req.originalUrl, res.statusCode, res.get('Content-Length') ?? 0, millis.toFixed(0), userAgentId, cfg.instanceName]);
            } catch (err) {
              console.error(err);
            } finally {
              client.release();
            }
          })
          .catch(console.error);

      return res;
    };

    next();
  });
}

/* Logging webserver request to file */
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