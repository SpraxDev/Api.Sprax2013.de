const request = require('request');
const net = require('net');
const NodeCache = require('node-cache');

const db = require('./../db-utils/DB_Mojang');

const Utils = require('./../utils');

const SKIN_STEVE = require('fs').readFileSync('./storage/static/steve.png'),
  SKIN_ALEX = require('fs').readFileSync('./storage/static/alex.png');

//FIXME: UUID '3126ba4c6uud424c877d1347fa974d23' belongs to user '_' but is not a valid UUID - API throws 500 because it detects it as invalid UUID (But should return the profile)

// Add "Cache-Control: max-age=1000" as a header (replace 1000 with the remaining stdTTL)
// Use Page Rules on CloudFlare to 'Cache Everything' so cloudflare caches too
const cache = new NodeCache({ stdTTL: 62, checkperiod: 120 });
const longCache = new NodeCache({ stdTTL: 900, checkperiod: 1800 });
const statsCache = new NodeCache({ stdTTL: 900 /* 15min */ });
let avoidMojangAPI_Profile = false, avoidMojangAPI_Name = false, avoidMojangAPI_History = false;

const router = require('express').Router();

/* Player Routes */
router.get('/profile/:user', (req, res, next) => {
  let user = req.params.user.trim();
  const internalUserAgent = req.token && Utils.TokenSystem.getPermissions(req.token).includes(Utils.TokenSystem.PERMISSION.INTERNAL_USER_AGENT);

  if (Utils.isUUID(user)) {
    getProfile(user, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));

      if (json == null) return next(Utils.createError(204, 'The UUID does not belong to any account'));

      res.set('Cache-Control', 'public, s-maxage=62')
        .send(json);
    }, `Api.Sprax2013.De (Mojang-Route) (${req.header('User-Agent')})`, internalUserAgent);
  } else if (isValidUsername(user)) {
    getUUIDAt(user, null, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));

      if (json == null) return next(Utils.createError(204, 'The username does not belong to any account'));

      getProfile(json.id, (err, json) => {
        if (err) return next(Utils.logAndCreateError(err));

        if (json == null) return next(Utils.createError(204, 'The UUID does not belong to any account'));

        res.set('Cache-Control', 'public, s-maxage=62')
          .send(json);
      }, `Api.Sprax2013.De (Mojang-Route) (${req.header('User-Agent')})`, internalUserAgent);
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

    res.set('Cache-Control', 'public, s-maxage=62')
      .send(json);
  });
});

router.get('/history/:user', (req, res, next) => {
  let user = req.params.user.trim();

  if (Utils.isUUID(user)) {
    getNameHistory(user, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));

      if (json == null) return next(Utils.createError(204, 'The UUID does not belong to any account'));

      res.set('Cache-Control', 'public, s-maxage=62')
        .send(json);
    });
  } else if (isValidUsername(user)) {
    getUUIDAt(user, null, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));

      if (json == null) return next(Utils.createError(204, 'The username does not belong to any account'));

      getNameHistory(json['id'], (err, json) => {
        if (err) return next(Utils.logAndCreateError(err));

        if (json == null) return next(Utils.createError(204, 'The UUID does not belong to any account'));

        res.set('Cache-Control', 'public, s-maxage=62')
          .send(json);
      });
    });
  } else {
    return next(Utils.createError(400, 'The parameter \'User\' is invalid'));
  }
});

router.get('/known/:user', (req, res, next) => {
  let user = req.params.user.trim();

  if (Utils.isUUID(user)) {
    db.isUUIDKnown(user, (err, isKnown) => {
      if (err) return next(Utils.logAndCreateError(err));

      res.set('Cache-Control', 'public, s-maxage=7884000, max-age=7884000' /* 3months */)
        .send({
          known: isKnown
        });
    });
  } else if (isValidUsername(user)) {
    db.isUsernameKnown(user, (err, isKnown) => {
      if (err) return next(Utils.logAndCreateError(err));

      res.set('Cache-Control', 'public, s-maxage=7884000, max-age=7884000' /* 3months */)
        .send({
          known: isKnown
        });
    });
  } else {
    return next(Utils.createError(400, 'The parameter \'User\' is invalid'));
  }
});

/* Skin Routes */
router.get('/skin/:user', (req, res, next) => {
  let user = req.params.user.trim();

  const internalUserAgent = req.token && Utils.TokenSystem.getPermissions(req.token).includes(Utils.TokenSystem.PERMISSION.INTERNAL_USER_AGENT);

  if (Utils.isUUID(user)) {
    getProfile(user, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));
      if (json == null) return next(Utils.createError(204, 'The UUID does not belong to any account'));

      if (json['properties']) {
        for (const prop in json['properties']) {
          if (json['properties'].hasOwnProperty(prop)) {
            const value = json['properties'][prop];

            if (value['name'] == 'textures' && value['value']) {
              const skin = JSON.parse(Buffer.from(value['value'], 'base64').toString('ascii'));

              if (skin['textures'] && skin['textures']['SKIN']) {
                return res.set('Cache-Control', 'public, s-maxage=62')
                  .send({
                    url: skin['textures']['SKIN']['url'],
                    slim: (skin['textures']['SKIN']['metadata'] && skin['textures']['SKIN']['metadata']['model'] == 'slim') || false
                  });
              }
            }
          }
        }
      }

      const slim = isAlexDefaultSkin(json['id']);
      res.status(404).set('Cache-Control', 'public, s-maxage=62')
        .send({
          url: slim ?
            'http://textures.minecraft.net/texture/63b098967340daac529293c24e04910509b208e7b94563c3ef31dec7b3750' :
            'http://textures.minecraft.net/texture/66fe51766517f3d01cfdb7242eb5f34aea9628a166e3e40faf4c1321696',
          slim: slim
        });
    }, `Api.Sprax2013.De (Mojang-Route) (${req.header('User-Agent')})`, internalUserAgent);
  } else if (isValidUsername(user)) {
    getUUIDAt(user, null, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));
      if (json == null) return next(Utils.createError(204, 'The username does not belong to any account'));

      getProfile(json.id, (err, json) => {
        if (err) return next(Utils.logAndCreateError(err));
        if (json == null) return next(Utils.createError(204, 'The UUID does not belong to any account'));

        if (json['properties']) {
          for (const prop in json['properties']) {
            if (json['properties'].hasOwnProperty(prop)) {
              const value = json['properties'][prop];

              if (value['name'] == 'textures' && value['value']) {
                const skin = JSON.parse(Buffer.from(value['value'], 'base64').toString('ascii'));

                if (skin['textures'] && skin['textures']['SKIN']) {
                  return res.set('Cache-Control', 'public, s-maxage=62')
                    .send({
                      url: skin['textures']['SKIN']['url'],
                      slim: (skin['textures']['SKIN']['metadata'] && skin['textures']['SKIN']['metadata']['model'] == 'slim') || false
                    });
                }
              }
            }
          }
        }

        const slim = isAlexDefaultSkin(json['id']);
        res.status(404).set('Cache-Control', 'public, s-maxage=62')
          .send({
            url: slim ? 'http://textures.minecraft.net/texture/63b098967340daac529293c24e04910509b208e7b94563c3ef31dec7b3750' : 'http://textures.minecraft.net/texture/66fe51766517f3d01cfdb7242eb5f34aea9628a166e3e40faf4c1321696',
            slim: slim
          });
      }, `Api.Sprax2013.De (Mojang-Route) (${req.header('User-Agent')})`, internalUserAgent);
    });
  } else {
    return next(Utils.createError(400, 'The parameter \'User\' is invalid'));
  }
});

router.get('/skinfile/:user', (req, res, next) => {
  let user = req.params.user.trim();
  const internalUserAgent = req.token && Utils.TokenSystem.getPermissions(req.token).includes(Utils.TokenSystem.PERMISSION.INTERNAL_USER_AGENT);

  if (Utils.isUUID(user)) {
    getProfile(user, (err, json) => {
      if (err) Utils.logAndCreateError(err);

      if (!err && json && json['properties']) {
        for (const prop in json['properties']) {
          if (json['properties'].hasOwnProperty(prop)) {
            const value = json['properties'][prop];

            if (value['name'] == 'textures' && value['value']) {
              const skin = JSON.parse(Buffer.from(value['value'], 'base64').toString('ascii'));

              if (skin['textures'] && skin['textures']['SKIN']) {
                return request(skin['textures']['SKIN']['url'].replace('http://', 'https://'),
                  { encoding: null }, (err, _httpRes, body) => {
                    if (err) return next(Utils.logAndCreateError(err));

                    res.set('Cache-Control', 'public, s-maxage=62')
                      .contentType('png').send(body);
                  });
              }
            }
          }
        }
      }

      res.status(404).set('Cache-Control', 'public, s-maxage=62')
        .contentType('png').send(
          (!err && json && !isAlexDefaultSkin(json['id'])) ?
            SKIN_STEVE :
            SKIN_ALEX);
    }, `Api.Sprax2013.De (Mojang-Route) (${req.header('User-Agent')})`, internalUserAgent);
  } else if (isValidUsername(user)) {
    getUUIDAt(user, null, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));
      if (json == null) return next(Utils.createError(204, 'The username does not belong to any account'));

      getProfile(json.id, (err, json) => {
        if (err) Utils.logAndCreateError(err);

        if (!err && json && json['properties']) {
          for (const prop in json['properties']) {
            if (json['properties'].hasOwnProperty(prop)) {
              const value = json['properties'][prop];

              if (value['name'] == 'textures' && value['value']) {
                const skin = JSON.parse(Buffer.from(value['value'], 'base64').toString('ascii'));

                if (skin['textures'] && skin['textures']['SKIN']) {
                  return request(skin['textures']['SKIN']['url'].replace('http://', 'https://'),
                    { encoding: null }, (err, _httpRes, body) => {
                      if (err) return next(Utils.logAndCreateError(err));

                      res.set('Cache-Control', 'public, s-maxage=62')
                        .contentType('png').send(body);
                    });
                }
              }
            }
          }
        }

        res.status(404).set('Cache-Control', 'public, s-maxage=62')
          .contentType('png').send(
            (!err && json && !isAlexDefaultSkin(json['id'])) ?
              SKIN_STEVE :
              SKIN_ALEX);
      }, `Api.Sprax2013.De (Mojang-Route) (${req.header('User-Agent')})`, internalUserAgent);
    });
  } else {
    return res.status(404).set('Cache-Control', 'public, s-maxage=172800')
      .contentType('png').send(SKIN_ALEX);
  }
});

/* Blocked servers Routes */

router.get('/blockedservers', (_req, res, next) => {
  getBlockedServers((err, json) => {
    if (err) return next(Utils.logAndCreateError(err));

    res.set('Cache-Control', 'public, s-maxage=900' /* 15min */)
      .send(json);
  });
});

router.get('/blockedservers/known', (req, res, next) => {
  let listHosts = req.query.listHosts ? Utils.toBoolean(req.query.listHosts) : true;

  getKnownServer((err, json) => {
    if (err) return next(Utils.logAndCreateError(err));

    if (!listHosts) {
      delete json.hosts;
    }

    res.set('Cache-Control', 'public, s-maxage=900' /* 15min */)
      .send(json);
  });
});

/* Stats */
router.use('/stats', (req, res, next) => {
  getStats((err, stats) => {
    if (err) return next(Utils.logAndCreateError(err));

    res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=600, s-maxage=0');

    // if (req.token && Utils.TokenSystem.getPermissions(req.token).includes(Utils.TokenSystem.PERMISSION.SKINDB_ADVANCED_STATISTICS)) {
    //   return getAdvancedStats((err, advStats) => {
    //     if (err) return next(Utils.logAndCreateError(err));

    //     stats['advanced'] = advStats;

    //     res.send(stats);
    //   });
    // }

    res.send(stats);
  });
});

// FIXME: Causes a lot of memory usage over time (when constantly requested)
// router.get('/blockedservers/check', (req, res, next) => {
//   let host = req.query.host;

//   if (!host) return next(Utils.createError(400, 'The query-parameter \'Host\' is missing'));

//   host = host.trim().toLowerCase();

//   let hosts = {};

//   if (net.isIPv4(host)) {
//     for (const s of host.split('.')) {
//       let s2 = host.substring(0, host.lastIndexOf(s));

//       if (s2) {
//         hosts[s2 + '*'] = Utils.getSHA1(s2 + '*');
//       }
//     }
//   } else if (host.indexOf('.') >= 0) {
//     for (const s of host.split('.')) {
//       let s2 = host.substring(host.indexOf(s));

//       while (s2.indexOf('*.') == 0) {
//         s2 = s2.substring(2);
//       }
//       while (s2.indexOf('.') == 0) {
//         s2 = s2.substring(1);
//       }

//       hosts['*.' + s2] = Utils.getSHA1('*.' + s2);

//       if (s2.indexOf('.') > 0) {
//         hosts[s2] = Utils.getSHA1(s2);
//       }
//     }
//     // } else if (host.length == 40 && /^[a-z0-9]+$/i.test(host)) {  // Looks like SHA1
//   } else {
//     return next(Utils.createError(400, 'The query-parameter \'Host\' is invalid'));
//   }

//   getBlockedServers((err, blocked) => {
//     if (err) return next(Utils.logAndCreateError(err));

//     let json = {};

//     for (const host in hosts) {
//       if (hosts.hasOwnProperty(host)) {
//         let hash = hosts[host];

//         db.setHost(host, hash, (err) => {
//           if (err) return Utils.logAndCreateError(err);
//         });

//         let isBlocked = blocked.includes(hash);

//         if (isBlocked) {
//           longCache.del('KnownBlockedServers');
//         }

//         json[host] = isBlocked;
//       }
//     }

//     res.set('Cache-Control', 'public, s-maxage=900' /* 15min */)
//       .send(json);
//   });
// });

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

      while (s2.indexOf('*.') == 0) {
        s2 = s2.substring(2);
      }
      while (s2.indexOf('.') == 0) {
        s2 = s2.substring(1);
      }

      hosts['*.' + s2] = Utils.getSHA1('*.' + s2);

      if (s2.indexOf('.') > 0) {
        hosts[s2] = Utils.getSHA1(s2);
      }
    }
    // } else if (host.length == 40 && /^[a-z0-9]+$/i.test(host)) {  // Looks like SHA1
  } else {
    return next(Utils.createError(400, 'The query-parameter \'Host\' is invalid'));
  }

  let waiting = Object.keys(hosts).length;

  for (const host in hosts) {
    if (hosts.hasOwnProperty(host)) {
      let hash = hosts[host];

      db.setHost(host, hash, (err) => {
        waiting--;

        if (waiting <= 0) {
          return res.set('Cache-Control', 'public, s-maxage=900' /* 15min */)
            .send({
              success: true,
              wtf: 'This route has been changed drastically because it caused some trouble...\n' +
                'It currently stores the provided host into the database but is not able to responde if it is blocked or not\n' +
                'I am very sorry!'
            });
        }

        if (err) return Utils.logAndCreateError(err);
      });
    }
  }
});

module.exports = router;

/**
 * @param {String} uuid 
 * @param {Function} callback 
 * @param {String} userAgent
 * @param {Boolean} internalUserAgent
 */
function getProfile(uuid, callback, userAgent = '', internalUserAgent = false) {
  uuid = uuid.toLowerCase().replace(/-/g, '');

  const cached = cache.get(uuid);

  if (cached !== undefined) {
    if (cached instanceof Error) {
      callback(cached);
    } else {
      callback(null, cached);
    }
  } else if (avoidMojangAPI_Profile) {
    return getProfileFromFallback(uuid, callback, userAgent, internalUserAgent);
  } else {
    request('https://sessionserver.mojang.com/session/minecraft/profile/' + uuid + '?unsigned=false', (err, res, body) => {
      if (err) {
        cache.set(uuid, err);
        return callback(err);
      }

      if (res.statusCode == 200) {
        let json = JSON.parse(body);

        const texture = Utils.Mojang.getProfileTextures(json);
        db.updateGameProfile(json, texture, (err) => {
          if (err) console.error('Fehler beim speichern des GPs in die DB:', err);
        });

        if (userAgent && texture.skinURL) {
          require('./SkinDB').queueSkin(null, undefined, texture.skinURL, texture.value, texture.signature, userAgent, internalUserAgent);
        }

        cache.set(uuid, json);

        cache.set(json['name'].toLowerCase() + '@', {
          id: json['id'],
          name: json['name']
        });

        return callback(null, json);
      } else if (res.statusCode == 204) {
        cache.set(uuid, null);

        return callback(null, null);
      } else if (res.statusCode == 429) {
        avoidMojangAPI_Profile = true;
        setTimeout(() => avoidMojangAPI_Profile = false, 60000); // Use Timeout instead of checking 2 numbers on every request during this period
        return getProfileFromFallback(uuid, callback, userAgent, internalUserAgent);
      } else {
        let error = Utils.createError(500, `Mojang responded with HTTP-StatusCode ${res.statusCode}`);

        cache.set(uuid, error);
        return callback(error);
      }
    });
  }
}

/**
 * @param {String} uuid 
 * @param {Function} callback 
 * @param {String} userAgent
 * @param {Boolean} internalUserAgent
 */
function getProfileFromFallback(uuid, callback, userAgent = '', internalUserAgent = false) {
  uuid = uuid.toLowerCase().replace(/-/g, '');

  request('https://api.ashcon.app/mojang/v2/user/' + uuid, (err, res, body) => {
    if (err) {
      cache.set(uuid, err);
      return callback(err);
    }

    if (res.statusCode == 200) {
      let rawJSON = JSON.parse(body);
      let json = {};

      json.id = rawJSON['uuid'].replace('-', '');
      json.name = rawJSON['username'];
      json.properties = [];

      json.properties.push({
        name: 'textures',
        value: rawJSON['textures']['raw']['value'],
        signature: rawJSON['textures']['raw']['signature']
      });

      // json.legacy = 'unknown';  // This API does not report if an account is legacy

      const texture = Utils.Mojang.getProfileTextures(json);
      db.updateGameProfile(json, texture, (err) => {
        if (err) console.error('Fehler beim speichern des GPs in die DB:', err);
      });

      if (userAgent && texture.skinURL) {
        require('./SkinDB').queueSkin(null, undefined, texture.skinURL, texture.value, texture.signature, userAgent, internalUserAgent);
      }

      cache.set(uuid, json);

      cache.set(json['name'].toLowerCase() + '@', {
        id: json['id'],
        name: json['name']
      });

      return callback(null, json);
    } else if (res.statusCode == 404) {
      cache.set(uuid, null);

      return callback(null, null);
    } else {
      let error = Utils.createError(500, `api.ashcon.app responded with HTTP-StatusCode ${res.statusCode}`);

      cache.set(uuid, error);
      return callback(error);
    }
  });
}

function getUUIDAt(username, at, callback) {  // ToDo recode
  if (!at) {
    at = '';
  }

  const cacheKey = username.toLowerCase() + '@' + at.toLowerCase();
  const cached = cache.get(cacheKey);

  let suffix = '';
  if (at) {
    suffix = '?at=' + at;
  }

  if (cached !== undefined) {
    if (cached instanceof Error) {
      callback(cached);
    } else {
      callback(null, cached);
    }
  } else if (avoidMojangAPI_Name && suffix.length == 0) {
    return getUUIDAtFromFallback(username, callback);
  } else {
    request('https://api.mojang.com/users/profiles/minecraft/' + username + suffix, (err, res, body) => {
      if (err) {
        cache.set(cacheKey, err);
        return callback(err);
      }

      if (res.statusCode == 200) {
        let json = JSON.parse(body);

        cache.set(cacheKey, json);
        return callback(null, json);
      } else if (res.statusCode == 204) {
        cache.set(cacheKey, null);
        return callback(null, null);
      } else if (res.statusCode == 429 && suffix.length == 0) {
        avoidMojangAPI_Name = true;
        setTimeout(() => avoidMojangAPI_Name = false, 60000); // Use Timeout instead of checking 2 numbers on every request during this period
        return getUUIDAtFromFallback(username, callback);
      } else {
        const error = Utils.createError(500, `Mojang responded with HTTP-StatusCode ${res.statusCode}`);

        cache.set(cacheKey, error);
        return callback(error);
      }
    });
  }
}

function getUUIDAtFromFallback(username, callback) {  // ToDo recode
  const cacheKey = username.toLowerCase() + '@';

  request('https://api.ashcon.app/mojang/v1/user/' + username, (err, res, body) => {
    if (err) {
      cache.set(cacheKey, err);
      return callback(err);
    }

    if (res.statusCode == 200) {
      let rawJSON = JSON.parse(body);
      const json = {
        id: rawJSON['uuid'].replace('-', ''),
        name: rawJSON['username']
      };

      cache.set(cacheKey, json);
      return callback(null, json);
    } else if (res.statusCode == 404) {
      cache.set(cacheKey, null);
      return callback(null, null);
    } else {
      const error = Utils.createError(500, `api.ashcon.app responded with HTTP-StatusCode ${res.statusCode}`);

      cache.set(cacheKey, error);
      return callback(error);
    }
  });
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
  } else if (avoidMojangAPI_History) {
    return getNameHistoryFromFallback(uuid, callback);
  } else {
    request('https://api.mojang.com/user/profiles/' + uuid + '/names', (err, res, body) => {
      if (err) {
        cache.set('nh_' + uuid, err);
        callback(err);
        return;
      }

      if (res.statusCode == 200) {
        const json = JSON.parse(body);

        cache.set('nh_' + uuid, json);
        return callback(null, json);
      } else if (res.statusCode == 204) {
        cache.set('nh_' + uuid, null);
        return callback(null, null);
      } else if (res.statusCode == 429) {
        avoidMojangAPI_History = true;
        setTimeout(() => avoidMojangAPI_History = false, 60000); // Use Timeout instead of checking 2 numbers on every request during this period
        return getNameHistoryFromFallback(uuid, callback);
      } else {
        const error = Utils.createError(500, `Mojang responded with HTTP-StatusCode ${res.statusCode}`);

        cache.set('nh_' + uuid, error);
        return callback(error);
      }
    });
  }
}

function getNameHistoryFromFallback(uuid, callback) { // ToDo recode
  uuid = uuid.toLowerCase().replace(/-/g, '');

  request('https://api.ashcon.app/mojang/v2/user/' + uuid, (err, res, body) => {
    if (err) {
      cache.set('nh_' + uuid, err);
      callback(err);
      return;
    }

    if (res.statusCode == 200) {
      const rawJSON = JSON.parse(body);
      let json = rawJSON['username_history'];

      for (const entry of json) {
        if (entry['changed_at']) {
          entry['changed_at'] = Date.parse(entry['changed_at']);
        }
      }

      cache.set('nh_' + uuid, json);
      return callback(null, json);
    } else if (res.statusCode == 404) {
      cache.set('nh_' + uuid, null);
      return callback(null, null);
    } else {
      const error = Utils.createError(500, `api.ashcon.app responded with HTTP-StatusCode ${res.statusCode}`);

      cache.set('nh_' + uuid, error);
      return callback(error);
    }
  });
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

      if (res.statusCode == 200) {
        let hashes = [];

        for (const hash of body.split('\n')) {
          hashes.push(hash);
        }

        if (hashes[hashes.length - 1].trim() == '') {
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

/**
 * @param {String} username
 */
function isValidUsername(username) {
  return typeof username == 'string' && username.length <= 16 && !/[^0-9a-zA-Z_]/.test(username);
}

//TODO: Schmeißt irwie immer alex und nie steve?
/**
 * 
 * @param {*} uuid 
 * @author https://github.com/crafatar/crafatar/blob/1816b18b1292fca7ae123212b2b516a7532a332a/lib/skins.js#L137-L141
 */
function isAlexDefaultSkin(uuid) {
  var lsbs_even = parseInt(uuid[7], 16) ^
    parseInt(uuid[15], 16) ^
    parseInt(uuid[23], 16) ^
    parseInt(uuid[31], 16);
  return lsbs_even ? true : false;
}

/* Cached Res. */

function getStats(callback, forceUpdate = false) {
  let data = statsCache.get('stats');

  if (!data || forceUpdate) {
    db.getStats((err, stats) => {
      if (err) {
        statsCache.set('stats', err);
        return callback(err);
      }

      statsCache.set('stats', stats);

      callback(null, stats);
    });
  } else {
    if (data instanceof Error) {
      return callback(data);
    }

    callback(null, data);
  }
}

function updateCachedStats() {
  getStats(() => { }, true);
}
updateCachedStats();
setInterval(updateCachedStats, 14 * 60 * 1000); // 10min

module.exports.getUUIDAt = getUUIDAt;
module.exports.getProfile = getProfile;

module.exports.isValidUsername = isValidUsername;