const express = require('express');
const morgan = require('morgan');

const Utils = require('./utils');

const app = express();

app.use(morgan('dev'));

app.use(express.json());
// app.use(require('cookie-parser')(require('./storage/misc.json').CookieSecret));
app.use(require('express-bearer-token')());
// app.use(express.urlencoded({ extended: false }));

// Default response headers
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'User-Agent,Authorization,If-None-Match,Content-Type,If-Unmodified-Since');

  next();
});

// ToDo Set caching headers on routes
app.use('/status', require('./routes/Status'));
app.use('/skinDB', require('./routes/SkinDB'));
app.use('/mojang', require('./routes/Mojang'));

app.use('/hems', require('./routes/legacy_hems'));

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