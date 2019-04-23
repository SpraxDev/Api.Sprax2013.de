const express = require('express');
const net = require('net');
const NodeCache = require('node-cache');

const EOL = require('./../utils').EOL;

const router = express.Router();

const pingCache = new NodeCache({
  stdTTL: 90
});

router.use('/', (_req, res, _next) => {
  getBackendStatusSkinDB((status) => {
    res.json({
      api: 'OK',

      backend: {
        SkinDB: status
      }
    });
  });
});

module.exports = router;

function getBackendStatusSkinDB(callback) {
  let result = pingCache.get('SkinDB-Backend');

  if (result === undefined) {
    let handleErr = function () {
      client.destroy();

      result = 'ERROR';
      pingCache.set('SkinDB-Backend', result);

      callback(result);
    };

    let client = new net.Socket();
    client.on('error', handleErr);
    client.on('timeout', handleErr);
    client.on('data', () => {
      client.destroy();

      result = 'OK';
      pingCache.set('SkinDB-Backend', result);

      callback(result);
    });

    client.connect(7999, '127.0.0.1', () => {
      client.write('status' + EOL);
    });
  } else {
    callback(result);
  }
}