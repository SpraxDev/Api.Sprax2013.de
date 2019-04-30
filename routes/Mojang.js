const request = require('request');
const net = require('net');
const NodeCache = require('node-cache');

const db = require('./../db-utils/DB_Mojang');

const Utils = require('./../utils');

// Add "Cache-Control: max-age=1000" as a header (replace 1000 with the remaining stdTTL)
// Use Page Rules on CloudFlare to 'Cache Everything' so cloudflare caches too
const cache = new NodeCache({ stdTTL: 62 });
const longCache = new NodeCache({ stdTTL: 1800 });

const router = require('express').Router();

/* Player Routes */
router.get('/profile/:user', (req, res, next) => {
  let user = req.params.user.trim();

  if (Utils.isUUID(user)) {
    getProfile(user, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));

      if (json == null) return next(Utils.createError(204, 'The UUID does not belong to any account'));

      res.json(json);
    });
  } else if (isValidUsername(user)) {
    getUUIDAt(user, null, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));

      if (json == null) return next(Utils.createError(204, 'The username does not belong to any account'));

      getProfile(json.id, (err, json) => {
        if (err) return next(Utils.logAndCreateError(err));

        if (json == null) return next(Utils.createError(204, 'The UUID does not belong to any account'));

        res.json(json);
      });
    });
  } else {
    return next(Utils.createError(400, 'The parameter \'User\' is invalid'));
  }
});

router.get('/uuid/:username/:at?', (req, res, next) => {
  let username = req.params.username.trim(),
    at = req.params.at ? Utils.toInteger(req.params.at) : null;

  if (!isValidUsername(username)) return next(Utils.createError(400, 'The parameter \'Username\' is invalid'));
  if (req.params.at && Number.isNaN(at)) return next(Utils.createError(400, 'The parameter \'At\' is invalid'));

  getUUIDAt(username, at, (err, json) => {
    if (err) return next(Utils.logAndCreateError(err));

    if (json == null) return next(Utils.createError(204, 'The username does not belong to any account'));

    res.json(json);
  });
});

router.get('/history/:user', (req, res, next) => {
  let user = req.params.user.trim();

  if (Utils.isUUID(user)) {
    getNameHistory(user, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));

      if (json == null) return next(Utils.createError(204, 'The UUID does not belong to any account'));

      res.json(json);
    });
  } else if (isValidUsername(user)) {
    getUUIDAt(user, null, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));

      if (json == null) return next(Utils.createError(204, 'The username does not belong to any account'));

      getNameHistory(json['id'], (err, json) => {
        if (err) return next(Utils.logAndCreateError(err));

        if (json == null) return next(Utils.createError(204, 'The UUID does not belong to any account'));

        res.json(json);
      });
    });
  } else {
    return next(Utils.createError(400, 'The parameter \'User\' is invalid'));
  }
});

/* Blocked servers Routes */

router.get('/blockedservers', (_req, res, next) => {
  getBlockedServers((err, json) => {
    if (err) return next(Utils.logAndCreateError(err));

    res.json(json);
  });
});

router.get('/blockedservers/known', (req, res, next) => {
  let listHosts = req.query.listHosts ? Utils.toBoolean(req.query.listHosts) : true;

  getKnownServer((err, json) => {
    if (err) return next(Utils.logAndCreateError(err));

    if (!listHosts) {
      delete json.hosts;
    }

    res.json(json);
  });
});

router.get('/blockedservers/check', (req, res, next) => {
  let host = req.query.host;

  if (!host) return next(Utils.createError(400, 'The query-parameter \'Host\' is missing'));

  host = host.trim().toLowerCase();

  let hosts = {};

  if (net.isIPv4(host)) {
    for (const s of host.split('.')) {
      let s2 = host.substring(0, host.lastIndexOf(s));

      if (s2) {
        hosts[s2 + '*'] = Utils.getSHA1(s2 + '*');
      }
    }
  } else if (host.indexOf('.') >= 0) {
    for (const s of host.split('.')) {
      let s2 = host.substring(host.indexOf(s));

      while (s2.indexOf('*.') === 0) {
        s2 = s2.substring(2);
      }
      while (s2.indexOf('.') === 0) {
        s2 = s2.substring(1);
      }

      hosts['*.' + s2] = Utils.getSHA1('*.' + s2);

      if (s2.indexOf('.') > 0) {
        hosts[s2] = Utils.getSHA1(s2);
      }
    }
    // } else if (host.length === 40 && /^[a-z0-9]+$/i.test(host)) {  // Looks like SHA1
  } else {
    return next(Utils.createError(400, 'The query-parameter \'Host\' is invalid'));
  }

  getBlockedServers((err, blocked) => {
    if (err) return next(Utils.logAndCreateError(err));

    let json = {};

    for (const host in hosts) {
      if (hosts.hasOwnProperty(host)) {
        let hash = hosts[host];

        db.setHost(host, hash, (err) => {
          if (err) {
            console.error(err);
          }
        });

        let isBlocked = blocked.includes(hash);

        if (isBlocked) {
          longCache.del('KnownBlockedServers');
        }

        json[host] = isBlocked;
      }
    }

    res.json(json);
  });
});

module.exports = router;

/**
 * @param {String} uuid 
 * @param {Function} callback 
 */
function getProfile(uuid, callback) {
  uuid = uuid.toLowerCase().replace(/-/g, '');

  const cached = cache.get(uuid);

  if (cached !== undefined) {
    if (cached instanceof Error) {
      callback(cached);
    } else {
      callback(null, cached);
    }
  } else {
    request('https://sessionserver.mojang.com/session/minecraft/profile/' + uuid + '?unsigned=false', (err, res, body) => {
      if (err) {
        cache.set(uuid, err);
        return callback(err);
      }

      if (res.statusCode === 200) {
        let json = JSON.parse(body);

        cache.set(uuid, json);

        cache.set(json['name'].toLowerCase() + '@', {
          id: json['id'],
          name: json['name']
        });

        return callback(null, json);
      } else if (res.statusCode === 204) {
        cache.set(uuid, null);

        return callback(null, null);
      } else {
        let error = Utils.createError(500, `Mojang responded with HTTP-StatusCode ${res.statusCode}`);

        cache.set(uuid, error);
        return callback(error);
      }
    });
  }
}

function getUUIDAt(username, at, callback) {  // ToDo recode
  username = username.toLowerCase();

  if (at) {
    at = at.toLowerCase();
  } else {
    at = '';
  }

  var cacheKey = username + '@' + at;
  const cached = cache.get(cacheKey);

  if (cached !== undefined) {
    if (cached instanceof Error) {
      callback(cached);
    } else {
      callback(null, cached);
    }
  } else {
    let suffix = '';
    if (at) {
      suffix = '?at=' + at;
    }

    request('https://api.mojang.com/users/profiles/minecraft/' + username + suffix, (err, res, body) => {
      if (err) {
        cache.set(cacheKey, err);
        return callback(err);
      }

      if (res.statusCode === 200) {
        let json = JSON.parse(body);

        cache.set(cacheKey, json);
        return callback(null, json);
      } else if (res.statusCode === 204) {
        cache.set(cacheKey, null);
        return callback(null, null);
      } else {
        let error = Utils.createError(500, `Mojang responded with HTTP-StatusCode ${res.statusCode}`);

        cache.set(cacheKey, error);
        return callback(error);
      }
    });
  }
}

function getNameHistory(uuid, callback) { // ToDo recode
  uuid = uuid.toLowerCase().replace(/-/g, '');

  const cached = cache.get('nh_' + uuid);

  if (cached !== undefined) {
    if (cached instanceof Error) {
      callback(cached);
    } else {
      callback(null, cached);
    }
  } else {
    request('https://api.mojang.com/user/profiles/' + uuid + '/names', (err, res, body) => {
      if (err) {
        cache.set('nh_' + uuid, err);
        callback(err);
        return;
      }

      if (res.statusCode === 200) {
        let json = JSON.parse(body);

        cache.set('nh_' + uuid, json);
        return callback(null, json);
      } else if (res.statusCode === 204) {
        cache.set('nh_' + uuid, null);
        return callback(null, null);
      } else {
        let error = Utils.createError(500, `Mojang responded with HTTP-StatusCode ${res.statusCode}`);

        cache.set('nh_' + uuid, error);
        return callback(error);
      }
    });
  }
}

function getBlockedServers(callback) {  // ToDo recode
  const cached = longCache.get('BlockedServers');

  if (cached !== undefined) {
    if (cached instanceof Error) {
      callback(cached);
    } else {
      callback(null, cached);
    }
  } else {
    request('https://sessionserver.mojang.com/blockedservers', (err, res, body) => {
      if (err) {
        longCache.set('BlockedServers', err);
        return callback(err);
      }

      if (res.statusCode === 200) {
        let hashes = [];

        for (const hash of body.split('\n')) {
          hashes.push(hash);
        }

        if (hashes[hashes.length - 1].trim() === '') {
          hashes.pop();
        }

        longCache.set('BlockedServers', hashes);
        return callback(null, hashes);
      } else {
        let error = Utils.createError(500, `Mojang responded with HTTP-StatusCode ${res.statusCode}`);

        return callback(error);
      }
    });
  }
}

function getKnownServer(callback) { // ToDo recode
  const cached = longCache.get('KnownBlockedServers');

  if (cached !== undefined) {
    if (cached instanceof Error) {
      callback(cached);
    } else {
      callback(null, cached);
    }
  } else {
    getBlockedServers((err, blocked) => {
      if (err) {
        longCache.set('KnownBlockedServers', err);
        return callback(err);
      } else {
        db.getHost(blocked, (err, known) => {
          if (err) {
            longCache.set('KnownBlockedServers', err);
            return callback(err);
          } else {
            let hosts = [];

            for (const host in known) {
              if (known.hasOwnProperty(host)) {
                hosts.push(host);
              }
            }

            db.getDatabaseSize((err, size) => {
              if (err) {
                longCache.set('KnownBlockedServers', err);
                return callback(err);
              } else {
                let json = {
                  blockedServers: blocked.length,
                  known: hosts.length,
                  database: size,

                  hosts: hosts
                };

                longCache.set('KnownBlockedServers', json);
                return callback(null, json);
              }
            });
          }
        });
      }
    });
  }
}

function isValidUsername(username) {
  return username.length <= 16 && !/[^0-9a-zA-Z_]/.test(username);
}

module.exports.getProfile = getProfile;