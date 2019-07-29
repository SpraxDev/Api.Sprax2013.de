const Utils = require('./utils');

const express = require('express'),
  morgan = require('morgan');

const logFormat = '[:date[web]] :remote-addr by :remote-user | :method :url :status with :res[content-length] bytes | ":user-agent" referred from ":referrer" | :response-time[3] ms';
const accessLogStream = require('rotating-file-stream')('access.log', {
  interval: '1d',
  maxFiles: 7,
  path: require('path').join(__dirname, 'logs', 'access'),
  compress: true
}),
  errorLogStream = require('rotating-file-stream')('error.log', {
    interval: '1d',
    maxFiles: 90,
    path: require('path').join(__dirname, 'logs', 'error'),
    compress: true
  });

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

// Log to console and file
app.use(morgan('dev', { skip: function (_req, res) { return res.statusCode < 400; } }));
app.use(morgan(logFormat, { stream: accessLogStream }));
app.use(morgan(logFormat, { skip: function (_req, res) { return res.statusCode < 400; }, stream: errorLogStream }));

app.use(express.json());
// app.use(require('cookie-parser')(require('./storage/misc.json').CookieSecret));
app.use(require('express-bearer-token')());
// app.use(express.urlencoded({ extended: false }));

// Default response headers
app.use((_req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'User-Agent,Authorization,If-None-Match,Content-Type,If-Unmodified-Since',

    'Cache-Control': 'public, s-maxage=90, max-age=90'
  });

  next();
});

// ToDo Set caching headers on routes
app.use('/status', require('./routes/Status'));
app.use('/skinDB', require('./routes/SkinDB'));
app.use('/mojang', require('./routes/Mojang'));

// app.use('/hems', require('./routes/legacy_hems'));

// Prepare 404
app.use((_req, _res, next) => {
  next(Utils.createError(404, 'The requested resource could not be found.'));
});

// Send Error
app.use((err, _req, res, _next) => {
  if (!err || !(err instanceof Error)) {
    err = Utils.createError();
  }

  if (!err.status || (err.status >= 500 && err.status < 600)) {
    console.error(err); // Log to file
  }

  if (!res.headersSent) {
    res.status(err.status || 500)
      .json({
        status: err.status,
        msg: err.message
      });
  }
});

module.exports = app;