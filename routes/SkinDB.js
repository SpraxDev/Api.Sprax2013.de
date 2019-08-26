const crypto = require('crypto');

const yggdrasilPublicKey = require('fs').readFileSync(require('path').join(__dirname, '../yggdrasil_session_pubkey.pem'));

const statsCache = new (require('node-cache'))({ stdTTL: 3600 /* 1h */ });

const Utils = require('./../utils'),
  Mojang = require('./Mojang'),
  db = require('./../db-utils/DB_SkinDB');

const router = require('express').Router();

// TODO: Einheitliche API-Fehlercodes einführen
// TODO: Im Wiki sagen, dass die Fehlernachrichten sich ändern können aber nicht den Sinn verändern
// TODO: Auf die passende Wiki-Seite hinweisen um den Fehler vllt. schneller finden zu können

router.post('/provide', (req, res, next) => {
  res.set({
    'Cache-Control': 'public, s-maxage=15, max-age=15'
  });

  if (!req.body) return next(Utils.createError(400, `The query-body is missing`, true));
  if (!req.body['uuids']
    || !Array.isArray(req.body['uuids'])
    || req.body['uuids'].length == 0) return next(Utils.createError(400, `The query-body is missing an 'uuids' array`, true));

  let json = {};
  let awaiting = 0;

  const decrementAwaiting = () => {
    awaiting--;

    if (awaiting <= 0) {
      return res.status(202).json(json);
    }
  };

  for (const uuid of req.body['uuids']) {
    if (typeof uuid === 'string' && Utils.isUUID(uuid)) {
      awaiting++;

      Mojang.getProfile(uuid, (err, profile) => {
        if (err) {
          err = Utils.logAndCreateError(err);
          json[uuid] = { status: err.status, msg: err.message };

          decrementAwaiting();
        }
        else if (!profile) {
          json[uuid] = { status: 204, msg: 'The UUID does not belong to any account' };

          decrementAwaiting();
        }
        else {
          const profileData = Utils.Mojang.getProfileTextures(profile);

          if (!profileData.skinURL || !profileData.signature) {
            json[uuid] = { status: 400, msg: 'That user does not have a skin' };

            decrementAwaiting();
          } else {
            queueSkin((pending) => {
              json[profile.id] = pending;

              decrementAwaiting();
            }, (err) => {
              json[profile.id] = { status: err.status, msg: err.message };

              decrementAwaiting();
            }, profileData.skinURL, profileData.value, profileData.signature, req.header('User-Agent'));
          }
        }
      }, null);
    }
  }
});

router.use('/provide', (req, res, next) => {
  res.set({
    'Cache-Control': 'public, s-maxage=0, max-age=15'
  });

  let value = req.query.value,
    signature = req.query.signature;

  if (!value) return next(Utils.createError(400, `The query-parameter 'value' is missing`, true));

  if (signature) {
    if (!isFromYggdrasil(value, signature)) return next(Utils.createError(400, `The provided 'signature' for 'value' is invalid or not signed by Yggdrasil`, true));

    const skin = JSON.parse(Buffer.from(value, 'base64').toString('ascii'));
    if (!skin['textures'] || !skin['textures']['SKIN']) return next(Utils.createError(400, 'That value does not contain a skin', true));

    return queueSkin(res, next, skin['textures']['SKIN']['url'], value, signature, req.header('User-Agent'));
  }
  else if (Utils.isUUID(value)) {
    Mojang.getProfile(value, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));
      if (!json) return next(Utils.createError(204, 'The UUID does not belong to any account', true));

      const profileData = Utils.Mojang.getProfileTextures(json);

      if (!profileData.skinURL || !profileData.signature) return next(Utils.createError(400, 'That user does not have a skin', true));

      return queueSkin(res, next, profileData.skinURL, profileData.value, profileData.signature, req.header('User-Agent'));
    }, null);
  }
  else if (Mojang.isValidUsername(value)) {
    Mojang.getUUIDAt(value, null, (err, json) => {
      if (err) return next(Utils.logAndCreateError(err));
      if (!json) return next(Utils.createError(204, 'The username does not belong to any account', true));

      Mojang.getProfile(json.id, (err, json) => {
        if (err) return next(Utils.logAndCreateError(err));
        if (!json) return next(Utils.createError(204, 'The UUID does not belong to any account', true));

        const profileData = Utils.Mojang.getProfileTextures(json);

        if (!profileData.skinURL || !profileData.signature) return next(Utils.createError(400, 'That user does not have a skin', true));

        return queueSkin(res, next, profileData.skinURL, profileData.value, profileData.signature, req.header('User-Agent'));
      }, null);
    });
  }
  else if (Utils.isURL(value)) {
    return queueSkin(res, next, value, null, null, req.header('User-Agent'));
  }

  else {
    return next(Utils.createError(400, `The provided 'value' is invalid`, true));
  }
});

router.use('/provide/:id?', (req, res, next) => {
  let id = Utils.toInteger(req.params.id);

  // Check for invalid content
  if (Number.isNaN(id)) return next(Utils.createError(400, `The parameter 'id' is invalid`));

  db.getQueue(id, (err, qObj) => {
    if (err) return next(Utils.logAndCreateError(err));

    if (!qObj) return next(Utils.createError(400, 'Nothing queued with the given ID', true));

    let cacheTime = qObj['Status'] == 'QUEUED' ? 60 : 172800 /* 48h */;

    res.set('Cache-Control', `public, s-maxage=${cacheTime}, max-age=${cacheTime}`)
      .json(qObj);
  });
});

router.use('/skin/random', (req, res, next) => {
  let count = req.query.count ? Utils.toInteger(req.query.count) : 1;

  // Check for invalid content
  if (Number.isNaN(count) || count < 1 || count > 50) return next(Utils.createError(400, `The query-parameter 'count' is invalid or too large`, true));

  db.getRandomSkinList(count, (err, skins) => {
    if (err) return next(Utils.logAndCreateError(err));

    if (skins.length == 0) return next(Utils.createError(400, 'No Skins were found', true));

    res.set('Cache-Control', 'public, s-maxage=0')
      .json(skins);
  });
});

router.use('/skin/:id/provider', (req, res, next) => {
  let id = Utils.toInteger(req.params.id);

  // Check for invalid content
  if (Number.isNaN(id)) return next(Utils.createError(400, `The parameter 'id' is invalid or missing`));

  db.getQueueBySkin(id, (err, queued) => {
    if (err) return next(Utils.logAndCreateError(err));

    if (!queued) return next(Utils.createError(400, 'No Skin was found', true));

    res.set('Cache-Control', 'public, s-maxage=0')
      .json(queued);
  });
});

// :id is optional to prevent 404 on missing :id
router.use('/skin/:id?', (req, res, next) => {
  let id = Utils.toInteger(req.params.id);

  // Check for invalid content
  if (Number.isNaN(id)) return next(Utils.createError(400, `The parameter 'id' is invalid or missing`, !!id /* false when NaN */));

  db.getSkin(id, (err, skin) => {
    if (err) return next(Utils.logAndCreateError(err));

    if (!skin) return next(Utils.createError(400, 'No Skin with the given ID', true));

    res.set('Cache-Control', 'public, s-maxage=172800' /* 48h */)
      .json(skin);
  });
});

router.use('/stats', (_req, res, next) => {
  getStats((err, stats) => {
    if (err) return next(Utils.logAndCreateError(err));

    res.set('Cache-Control', 'public, s-maxage=900' /* 15min */)
      .json(stats);
  });
});

module.exports = router;

/* Helper */

function queueSkin(res, next = () => { }, skinURL, value, signature, userAgent) {
  db.isQueued(skinURL, (err, isQueued) => {
    if (err) return next(Utils.logAndCreateError(err));
    if (isQueued) return next(Utils.createError(200, 'The skin is already in the database', true));

    db.getAgentID(userAgent, (err, agentID) => {
      if (err) return next(Utils.logAndCreateError(err));

      db.addQueue(skinURL, value, signature, agentID, (err, queueID) => {
        if (err) return next(Utils.logAndCreateError(err));

        if (res) {
          const json = {
            ID: queueID,
            status: `https://api.skindb.net/provide/${queueID}`
          };

          if (typeof res === 'function') {
            res(json);
          } else {
            res.status(202).json(json);
          }
        }
      });
    });
  });
}

function isFromYggdrasil(value, signature) {
  const ver = crypto.createVerify('sha1WithRSAEncryption');
  ver.update(value);

  return ver.verify(yggdrasilPublicKey, Buffer.from(signature, 'base64'));
}

/* Cached Res. */

function getStats(callback) {
  let data = statsCache.get('stats');

  if (!data) {
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

module.exports.queueSkin = queueSkin;