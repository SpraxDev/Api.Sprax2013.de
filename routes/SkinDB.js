const NodeCache = require('node-cache');

const Utils = require('./../utils');
const db = require('./../db-utils/SkinDB');

const statsCache = new NodeCache({ stdTTL: 600 /* 1h */ });

const SkinMetaElements = ['CharacterName', 'CharacterURL', 'SkinOriginName', 'SkinOriginURL', 'WearsMask', 'MaskCharacterName', 'MaskCharacterURL', 'WearsHat', 'HatType', 'Job', 'Accessories', 'MiscTags', 'Sex', 'Age', 'HairLength'],
  SkinMetaNumberElements = ['WearsMask', 'WearsHat', 'Sex', 'Age', 'HairLength'];

const router = require('express').Router();

/* Provide Routes */
router.use('/provide/:id', (req, res, next) => {
  let id = Utils.toInteger(req.params.id);

  // Check for invalid content
  if (Number.isNaN(id)) return next(Utils.createError(400, 'The parameter \'ID\' is invalid'));

  db.getPending(id, (err, status) => {
    if (err) next(Utils.logAndCreateError(err));

    res.json(status);
  });
});

router.use('/provide', (req, res, next) => {
  let data = req.query.data;

  // Check for invalid content
  if (!data) return next(Utils.createError(400, 'The query-parameter \'Data\' is missing'));
  data = data.trim();

  if (Utils.isUUID(data)) {
    require('./Mojang').getProfile(data, (err, profile) => {
      if (err) return next(Utils.createError(400, 'The UUID does not belong to an account'));

      profile = JSON.parse(profile);

      let hasSkin = false;
      if (profile.properties && profile.properties.length >= 1) {
        let texturesProp = JSON.parse(Buffer.from(profile.properties.shift().value, 'base64').toString('UTF-8'));

        if (texturesProp && texturesProp.textures && texturesProp.textures.SKIN && texturesProp.textures.SKIN.url) {
          hasSkin = true;

          let skinURL = texturesProp.textures.SKIN.url;

          db.isPendingOrInDB(skinURL, (err, bool) => {
            if (err) return next(Utils.logAndCreateError(err));
            if (bool) return next(Utils.createError(200, 'The skin belonging to the UUID is already in the database'));

            db.addPending(skinURL, req.header('User-Agent'), (err, pending) => {
              if (err) return next(Utils.logAndCreateError(err));

              res.status(202).json(pending);
            });
          });
        }
      }

      if (!hasSkin) return next(Utils.createError(200, 'The profile belonging to the UUID has no skin'));
    });
  } else if (Utils.isURL(data)) {
    db.isPendingOrInDB(data, (err, bool) => {
      if (err) return next(Utils.logAndCreateError(err));
      if (bool) return next(Utils.createError(200, 'The skin belonging to the UUID is already in the database'));

      db.addPending(data, req.header('User-Agent'), (err, pending) => {
        if (err) return next(Utils.logAndCreateError(err));

        res.status(202).json(pending);
      });
    });
  } else {
    return next(Utils.createError(400, 'The query-parameter \'Data\' is invalid'));
  }
});


/* Skin Routes */
router.use('/skin/list', (req, res, next) => {
  let count = Utils.toInteger(req.query.count) || 25,
    page = Utils.toInteger(req.query.page) || 1,
    sortDESC = req.query.desc ? Utils.toBoolean(req.query.desc) : true;

  // Check for invalid content
  if (Number.isNaN(count)) return next(Utils.createError(400, 'The query-parameter \'Count\' is invalid'));
  if (Number.isNaN(page)) return next(Utils.createError(400, 'The query-parameter \'Page\' is invalid'));

  // Check for invalid value
  if (count > 50) return next(Utils.createError(400, 'The query-parameter \'Count\' can not be greater than 50'));

  db.getSkinList(count, page, sortDESC, (err, skins) => {
    if (err) {
      next(Utils.logAndCreateError(err));
    } else {
      res.json(skins);
    }
  });
});

router.use('/skin/random', (req, res, next) => {
  let count = Utils.toInteger(req.query.count) || 1;

  // Check for invalid content
  if (Number.isNaN(count)) return next(Utils.createError(400, 'The query-parameter \'Count\' is invalid'));

  // Check for invalid value
  if (count > 50) return next(Utils.createError(400, 'The query-parameter \'Count\' can not be greater than 50'));

  db.getRandomSkinList(count, (err, skins) => {
    if (err) {
      next(Utils.logAndCreateError(err));
    } else {
      res.json(skins);
    }
  });
});

// ToDo Only allow with Token
router.post('/skin/:id/meta', (req, res, next) => {
  if (!req.token) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return next(Utils.createError(401, 'Unauthorized'));
  }

  if (!Utils.TokenSystem.getPermissions(req.token).includes(Utils.TokenSystem.PERMISSION.SKINDB_ADMIN)) return next(Utils.createError(403, 'Forbidden'));


  let id = Utils.toInteger(req.params.id);

  // Check for invalid content
  if (Number.isNaN(id)) return next(Utils.createError(400, 'The parameter \'ID\' is invalid'));
  if (!req.body || typeof req.body !== 'object') return next(Utils.createError(400, 'The body is invalid'));

  let cleanJSON = {}, cleanJSONKeyCount = 0;

  for (const key of SkinMetaElements) {
    let value = req.body[key];

    if (value !== undefined) {

      //ToDo Besser schreiben!
      if (SkinMetaNumberElements.includes(key)) {
        if (value == null || typeof value === 'number' || typeof value === 'boolean') {
          cleanJSON[key] = typeof value === 'string' ? value.trim() : value;
          cleanJSONKeyCount++;
        } else if (!Number.isNaN(Utils.toInteger(value))) {
          cleanJSON[key] = Utils.toInteger(value);
          cleanJSONKeyCount++;
        }
      } else {
        cleanJSON[key] = typeof value === 'string' ? value.trim() : value;
        cleanJSONKeyCount++;
      }
    }
  }

  if (cleanJSONKeyCount != SkinMetaElements.length) return next(Utils.createError(400, 'The body is invalid'));

  // ToDo Check if Skin with 'id' exists
  db.setSkinMeta(id, cleanJSON, (err) => {
    if (err) return next(Utils.logAndCreateError(err));

    res.json({ success: true });
  });
});

router.use('/skin/:id/meta', (req, res, next) => {
  let id = Utils.toInteger(req.params.id);

  // Check for invalid content
  if (Number.isNaN(id)) return next(Utils.createError(400, 'The parameter \'ID\' is invalid'));

  db.getSkinMeta(id, (err, meta) => {
    if (err) {
      next(Utils.logAndCreateError(err));
    } else {
      res.json(meta);
    }
  });
});

router.use('/skin/:id', (req, res, next) => {
  let id = Utils.toInteger(req.params.id);

  // Check for invalid content
  if (Number.isNaN(id)) return next(Utils.createError(400, 'The parameter \'ID\' is invalid'));

  db.getSkin(id, (err, skin) => {
    if (err) {
      next(Utils.logAndCreateError(err));
    } else {
      res.json(skin);
    }
  });
});

/* Misc. Routes */

router.use('/search', (req, res, next) => {
  res.json({ TODO: true });
});

router.use('/stats', (req, res, next) => {
  let deep = req.query.deep ? Utils.toBoolean(req.query.deep) : false;

  getStats(deep, (err, stats) => {
    if (err) return next(Utils.logAndCreateError(err));

    res.json(stats);
  });
});

module.exports = router;

// ToDo Dafür sorgen, dass ein 2. Thread wartet, bis der 1. in den cache geschrieben hat. Ein Art event-System nutzen in Verbindung mit nem Boolean
// ToDo Cache non-deep version?
function getStats(deep, callback) {
  let data = statsCache.get('stats');

  if (!data) {
    db.getStats((err, stats) => {
      if (err) {
        statsCache.set('stats', err);
        return callback(err);
      }

      statsCache.set('stats', stats);

      if (!deep) {
        let json = JSON.parse(JSON.stringify(stats));
        delete json['providedBy'];

        return callback(null, json);
      }

      callback(null, stats);
    });
  } else {
    if (data instanceof Error) {
      return callback(data);
    }

    callback(null, data);
  }
}