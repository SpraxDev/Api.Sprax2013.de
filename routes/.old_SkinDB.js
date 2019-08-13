const net = require('net');

const Utils = require('./../utils');
const db = require('./../db-utils/DB_SkinDB');

const SkinMetaElements = ['CharacterName', 'CharacterURL', 'SkinOriginName', 'SkinOriginURL', 'WearsMask', 'MaskCharacterName', 'MaskCharacterURL', 'WearsHat', 'HatType', 'Job', 'Accessories', 'MiscTags', 'Sex', 'Age', 'HairLength'],
  SkinMetaNumberElements = ['WearsMask', 'WearsHat', 'Sex', 'Age', 'HairLength'];

const router = require('express').Router();

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
      if (skins.length >= count) {
        res.set('Cache-Control', 'public, s-maxage=43200' /* 24h */);
      } else {
        res.set('Cache-Control', 'public, s-maxage=172800' /* 12h */);
      }

      res.json(skins);
    }
  });
});

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
      res.set('Cache-Control', 'public, s-maxage=3600' /* 48h */)
        .json(meta);
    }
  });
});

/* Misc. Routes */

router.use('/search', (req, res, next) => {
  let count = Utils.toInteger(req.query.count) || 25,
    page = Utils.toInteger(req.query.page) || 1,
    q = req.query.q;

  if (Number.isNaN(count)) return next(Utils.createError(400, 'The query-parameter \'Count\' is invalid'));
  if (Number.isNaN(page)) return next(Utils.createError(400, 'The query-parameter \'Page\' is invalid'));
  if (count > 50) return next(Utils.createError(400, 'The query-parameter \'Count\' can not be greater than 50'));

  if (!q) return next(Utils.createError(400, 'The query-parameter \'Q\' is missing'));
  q = Utils.toNeutralString(q);
  if (q.length > 128) return next(Utils.createError(400, 'The query-parameter \'Q\' has exceeded the maximum length of 128 characters'));
  q = q.toLowerCase();

  let sex = null; /* 0=none, 1=female, 2=male */
  let age = null; /* 0=normal, 1=senior */
  let hairLength = null; /* 0=normal, 1=long */

  if (q.indexOf('long hair') === 0 || q.indexOf(' long hair') >= 0) {
    hairLength = 1;
  }
  if (q.indexOf('short hair') === 0 || q.indexOf(' short hair') >= 0
    || q.indexOf('normal hair') === 0 || q.indexOf(' normal hair') >= 0) {
    hairLength = 0;
  }

  if (q.indexOf('female') === 0 || q.indexOf(' female') >= 0
    || q.indexOf('girl') === 0 || q.indexOf(' girl') >= 0) {
    sex = 1;
  }
  if (q.indexOf('male') === 0 || q.indexOf(' male') >= 0
    || q.indexOf('boy') === 0 || q.indexOf(' boy') >= 0) {
    sex = 2;
  }

  if (q.indexOf('normal age') === 0 || q.indexOf(' normal age') >= 0
    || q.indexOf('young') === 0 || q.indexOf(' young') >= 0) {
    age = 0;
  }
  if (q.indexOf('senior') === 0 || q.indexOf(' senior') >= 0
    || q.indexOf('old') === 0 || q.indexOf(' old') >= 0) {
    age = 1;
  }

  db.searchSkin(sex, age, hairLength, q.split(' '), count, page, (err, result) => {
    if (err) return next(Utils.logAndCreateError(err));

    res.set('Cache-Control', 'public, s-maxage=3600' /* 1h */)
      .json(result);
  });
});


module.exports = router;