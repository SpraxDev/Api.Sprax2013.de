import { JSDOM } from 'jsdom';
import canvas = require('canvas');
import crypto = require('crypto');
import fs = require('fs');
import path = require('path');
import request = require('request');

import tmImage = require('@teachablemachine/image');

import { Router } from 'express';

import { db } from '..';
import { MinecraftUser, UserAgent, Skin, Cape, CapeType } from '../global';
import { ErrorBuilder, restful, Image, setCaching, isNumber } from '../utils';
import { getUserAgent } from './minecraft';

const yggdrasilPublicKey = fs.readFileSync(path.join(__dirname, '..', '..', 'resources', 'yggdrasil_session_pubkey.pem'));

/* AI */
(global as any).document = new JSDOM(`<body><script>document.body.appendChild(document.createElement('hr'));</script></body>`).window.document;
(global as any).fetch = require('node-fetch');
(global as any).document = new JSDOM('<body></body>').window.document;
(global as any).fetch = require('node-fetch');

const AI_MODELS: { [key: string]: null | tmImage.CustomMobileNet | Error } = {
  GENDER: null,
  HUMAN: null
};
(async () => {
  tmImage.load('https://internal.skindb.net/ai-models/gender/model.json', 'https://internal.skindb.net/ai-models/gender/metadata.json')
    .then(obj => AI_MODELS.GENDER = obj)
    .catch(err => { AI_MODELS.GENDER = err; console.error(err); });
  tmImage.load('https://internal.skindb.net/ai-models/human/model.json', 'https://internal.skindb.net/ai-models/human/metadata.json')
    .then(obj => AI_MODELS.HUMAN = obj)
    .catch(err => { AI_MODELS.HUMAN = err; console.error(err); });
})();

/* Routes */
const router = Router();
export const skindbExpressRouter = router;

router.all('/import', (req, res, next) => {
  // user (uuid, name), texture-value (+signature), file(s), URL

  restful(req, res, {
    post: () => {
      const contentType = (req.headers['content-type'] || '').toLowerCase();

      if (contentType == 'image/png') {
        if (!(req.body instanceof Buffer)) return next(new ErrorBuilder().invalidBody([{ param: 'body', condition: 'Valid png under 3MB' }]));

        Image.fromImg(req.body, (err, img) => {
          if (err || !img) return next(new ErrorBuilder().invalidBody([{ param: 'body', condition: 'Valid png' }]));
          if (!img.hasSkinDimensions()) return next(new ErrorBuilder().invalidBody([{ param: 'body', condition: 'Valid minecraft skin dimensions 64x32px or 64x64px' }]));

          getUserAgent(req, (err, userAgent) => {
            if (err || !userAgent) return next(err || new ErrorBuilder().serverErr(undefined, `Could not fetch User-Agent`));

            importSkinByBuffer(req.body, null, userAgent, (err, skin, exactMatch) => {
              if (err || !skin) return next(err || new ErrorBuilder().serverErr(undefined, `Could not import uploaded skin by Buffer`));

              return setCaching(res, false, false)
                .status(exactMatch ? 200 : 201)
                .send({
                  result: exactMatch ? 'Skin already in database' : 'Skin added to database',
                  skinID: skin.id
                });
            });
          });
        });
      } else if (contentType == 'application/json') {
        const json: { url?: string, raw?: { value: string, signature?: string } } = req.body;

        if (json.raw) {
          if (!json.raw.value) return next(new ErrorBuilder().invalidBody([{ param: 'JSON-Body: json.raw.value', condition: 'Valid skin value from mojang profile' }]));
          if (json.raw.signature && !isFromYggdrasil(json.raw.value, json.raw.signature)) json.raw.signature = undefined;

          getUserAgent(req, (err, userAgent) => {
            if (err || !userAgent) return next(err || new ErrorBuilder().serverErr(undefined, `Could not fetch User-Agent`));
            if (!json.raw) return next(new ErrorBuilder().unknown());  // FIXME: why does TypeScript need this line? o.0

            importByTexture(json.raw.value, json.raw.signature || null, userAgent, (err, skin, cape) => {
              if (err) return next(err);

              return setCaching(res, false, false)
                .status(202) // TODO report if skin added to db or already was in db
                .send({
                  result: null, // TODO report if skin added to db or already was in db
                  skinID: skin?.id
                });
            });
          });
        } else if (json.url) {
          if (!MinecraftUser.getSecureURL(json.url).toLowerCase().startsWith('https://textures.minecraft.net/texture/'))
            return next(new ErrorBuilder().invalidBody([{ param: 'JSON-Body: json.url', condition: 'Valid textures.minecraft.net URL' }]));

          getUserAgent(req, (err, userAgent) => {
            if (err || !userAgent) return next(err || new ErrorBuilder().serverErr(undefined, `Could not fetch User-Agent`));
            if (!json.url) return next(new ErrorBuilder().unknown());  // FIXME: why does TypeScript need this line? o.0

            importSkinByURL(MinecraftUser.getSecureURL(json.url), userAgent, (err, skin, exactMatch) => {
              if (err || !skin) return next(err || new ErrorBuilder().serverErr(undefined, `Could not import uploaded skin-URL`));

              return setCaching(res, false, false)
                .status(exactMatch ? 200 : 201)
                .send({
                  result: exactMatch ? 'Skin already in database' : 'Skin added to database',
                  skinID: skin.id
                });
            })
          });
        } else {
          return next(new ErrorBuilder().invalidBody([]));  //TODO
        }
      } else {
        return next(new ErrorBuilder().invalidBody([]));  //TODO
      }
    }
  });
});

router.use('/cdn/skins/:id?/:type?', (req, res, next) => {
  if (req.params.id && req.params.id.endsWith('.png')) {
    req.params.id = req.params.id.substring(0, req.params.id.length - 4);
  }

  if (!req.params.id || !isNumber(req.params.id.trim())) return next(new ErrorBuilder().invalidParams('url', [{ param: 'id', condition: 'Is numeric string (0-9)' }]));

  if (req.params.type && (req.params.type.trim().toLowerCase() != 'original.png' || req.params.type.trim().toLowerCase() != 'clean.png')) return next(new ErrorBuilder().invalidParams('url', [{ param: 'type', condition: 'Empty or equal (ignore case) one of the following: original.png, clean.png' }]))

  const id = req.params.id.trim();
  const originalType = req.params.type && req.params.type.trim().toLowerCase() == 'original.png';

  db.getSkin(id, (err, skin) => {
    if (err) return next(err);
    if (!skin) return next(new ErrorBuilder().notFound('Skin for given ID'));

    db.getSkinImage(skin.duplicateOf || skin.id, originalType ? 'original' : 'clean', (err, img) => {
      if (err) return next(err);
      if (!img) return next(new ErrorBuilder().serverErr(`Could not find any image in db for skin (id=${skin.id})`, true));

      setCaching(res, true, true, 60 * 60 * 24 * 30 /*30d*/)
        .type('png')
        .send(img);
    });
  });
});

router.use('/cdn/capes/:id?', (req, res, next) => {
  if (req.params.id && req.params.id.endsWith('.png')) {
    req.params.id = req.params.id.substring(0, req.params.id.length - 4);
  }

  if (!req.params.id || !isNumber(req.params.id.trim())) return next(new ErrorBuilder().invalidParams('url', [{ param: 'id', condition: 'Is numeric string (0-9)' }]));

  const id = req.params.id.trim();

  db.getCape(id, (err, cape) => {
    if (err) return next(err);
    if (!cape) return next(new ErrorBuilder().notFound('Cape for given ID'));

    db.getCapeImage(cape.duplicateOf || cape.id, (err, img) => {
      if (err) return next(err);
      if (!img) return next(new ErrorBuilder().serverErr(`Could not find any image in db for cape (id=${cape.id})`, true));

      setCaching(res, true, true, 60 * 60 * 24 * 30 /*30d*/)
        .type('png')
        .send(img);
    });
  });
});

// router.all('/search', (req, res, next) => {
//   // Currently supported: user (uuid, name)

//   restful(req, res, {
//     get: () => {
//       if (typeof req.query.q != 'string') return next(new ErrorBuilder().invalidParams('query', [{ param: 'q', condition: 'Is string' }]));
//       if (!req.query.q || req.query.q.trim() <= 128) return next(new ErrorBuilder().invalidParams('query', [{ param: 'q', condition: 'q.length > 0 and q.length <= 128' }]));

//       const query: string = req.query.q.trim();
//       let waitingFor = 0;

//       const result: { profiles?: { direct?: CleanMinecraftUser[], indirect?: CleanMinecraftUser[] } } = {};

//       const sendResponse = (): void => {
//         if (waitingFor == 0) {
//           res.send(result);
//         }
//       };

//       if (query.length <= 16) {
//         waitingFor++;

//         getByUsername(query, null, (err, apiRes) => {
//           if (err) ApiError.log(`Searching by username for ${query} failed`, err);

//           if (apiRes) {
//             getByUUID(apiRes.id, req, (err, mcUser) => {
//               if (err) ApiError.log(`Searching by username for ${query} failed`, err);

//               if (mcUser) {
//                 if (!result.profiles) result.profiles = {};
//                 if (!result.profiles.direct) result.profiles.direct = [];

//                 result.profiles.direct.push(mcUser.toCleanJSON());
//               }

//               waitingFor--;
//               sendResponse();
//             });
//           } else {
//             waitingFor--;

//             if (waitingFor == 0) {
//               res.send(result);
//             }
//           }
//         });
//       } else if (isUUID(query)) {
//         waitingFor++;

//         getByUUID(query, req, (err, mcUser) => {
//           if (err) ApiError.log(`Searching by uuid for ${query} failed`, err);

//           if (mcUser) {
//             if (!result.profiles) result.profiles = {};
//             if (!result.profiles.direct) result.profiles.direct = [];

//             result.profiles.direct.push(mcUser.toCleanJSON());
//           }

//           waitingFor--;
//           sendResponse();
//         });
//       }

//       sendResponse();
//     }
//   });
// });

router.all('/ai/:model?', async (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.model || !AI_MODELS.hasOwnProperty(req.params.model.toUpperCase())) return next(new ErrorBuilder().invalidParams('url', [{ param: 'model', condition: `Equal (ignore case) one of the following: ${Object.keys(AI_MODELS).join('", "')}` }]));

      const querySkinID = req.query.skin;

      if (!req.query.skin) return next(new ErrorBuilder().invalidParams('query', [{ param: 'skin', condition: 'skin.length > 0' }]));
      if (typeof querySkinID != 'string' || !isNumber(querySkinID)) return next(new ErrorBuilder().invalidParams('query', [{ param: 'skin', condition: 'Is numeric string (0-9)' }]));

      const model = AI_MODELS[req.params.model.toUpperCase()];

      if (!model) {
        res.set('Retry-After', '2');
        return next(new ErrorBuilder().serviceUnavailable('This AI model is still being initialized'));
      } else if (model instanceof Error) {
        return next(new ErrorBuilder().serviceUnavailable('The requested AI model failed to initialize'));
      }

      db.getSkinImage(querySkinID, 'clean', (err, skin) => {
        if (err) return next(err);
        if (!skin) return next(new ErrorBuilder().serverErr(`Could not find any image in db for skin (id=${querySkinID})`, true));

        getPrediction(model, skin, (err, result) => {
          if (err || !result) return next(err);

          return res.send(result);
        });
      });
    }
  });
});

/* Helper */
function getPrediction(model: tmImage.CustomMobileNet, data: Buffer, callback: (err: Error | null, result: null | { className: string, probability: number }[]) => void): void {
  const can = canvas.createCanvas(64, 64);
  const ctx = can.getContext('2d');

  const img = new canvas.Image();
  img.onerror = err => callback(err, null);
  img.onload = async () => {
    ctx.drawImage(img, 0, 0, 64, 64);

    model.predict(can as any)
      .then(res => callback(null, res))
      .catch(err => callback(err, null));
  }

  img.src = data;
}

export function importByTexture(textureValue: string, textureSignature: string | null, userAgent: UserAgent, callback: (err: Error | null, skin: Skin | null, cape: Cape | null) => void): void {
  const texture = MinecraftUser.extractMinecraftProfileTextureProperty(textureValue);
  const skinURL: string | undefined = texture.textures.SKIN?.url,
    capeURL: string | undefined = texture.textures.CAPE?.url;

  let resultSkin: Skin | null = null,
    resultCape: Cape | null = null;

  // TODO signature invalid? Set null!
  // TODO request textures profile in case it is not in the db already (hits memory cache anyways if originated from profile look up)

  let waitingFor = 0;
  const done = () => {
    waitingFor--;

    if (waitingFor == 0) {
      callback(null, resultSkin, resultCape);
    }
  };

  if (skinURL) {
    waitingFor++;

    importSkinByURL(MinecraftUser.getSecureURL(skinURL), userAgent, (err, skin) => {
      if (err || !skin) return callback(err, null, null);

      resultSkin = skin;
      done();
    }, textureValue, textureSignature);
  }

  if (capeURL) {
    waitingFor++;

    importCapeByURL(MinecraftUser.getSecureURL(capeURL), CapeType.MOJANG, userAgent, (err, cape) => {
      if (err || !cape) return callback(err, null, null);

      resultCape = cape;
      done();
    }, textureValue, textureSignature || undefined);
  }
}

export function importSkinByURL(skinURL: string, userAgent: UserAgent, callback: (err: Error | null, skin: Skin | null, exactMatch: boolean) => void, textureValue: string | null = null, textureSignature: string | null = null): void {
  request.get(skinURL, { encoding: null, jar: true, gzip: true }, (err, httpRes, httpBody) => {
    if (err || httpRes.statusCode != 200) return callback(err, null, false);

    return importSkinByBuffer(httpBody, skinURL, userAgent, callback, textureValue, textureSignature);
  });
}

export function importSkinByBuffer(skin: Buffer, skinURL: string | null, userAgent: UserAgent, callback: (err: Error | null, skin: Skin | null, exactMatch: boolean) => void, textureValue: string | null = null, textureSignature: string | null = null): void {
  Image.fromImg(skin, (err, img) => {
    if (err || !img) return callback(err, null, false);

    img.toPngBuffer((err, orgSkin) => {
      if (err || !orgSkin) return callback(err, null, false);

      img.toCleanSkinBuffer((err, cleanSkin) => {
        if (err || !cleanSkin) return callback(err, null, false);

        db.addSkin(orgSkin, cleanSkin, skinURL, textureValue, textureSignature, userAgent, (err, skin, exactMatch) => {
          if (err || !skin) return callback(err, null, false);

          return callback(null, skin, exactMatch);
        });
      });
    });
  });
}

export function importCapeByURL(capeURL: string, capeType: CapeType, userAgent: UserAgent, callback: (err: Error | null, cape: Cape | null) => void, textureValue?: string, textureSignature?: string): void {
  request.get(capeURL, { encoding: null, jar: true, gzip: true }, (err, httpRes, httpBody) => {
    if (err) return callback(err, null);

    if (httpRes.statusCode == 200) {
      Image.fromImg(httpBody, (err, img) => {
        if (err || !img) return callback(err, null);

        img.toPngBuffer((err, capePng) => {
          if (err || !capePng) return callback(err, null);

          db.addCape(capePng, capeType, capeURL, capeType == CapeType.MOJANG ? textureValue || null : null, capeType == CapeType.MOJANG ? textureSignature || null : null, userAgent, (err, cape) => {
            if (err || !cape) return callback(err, null);

            return callback(null, cape);
          });
        });
      });
    }
  });
}

function isFromYggdrasil(data: string, signature: string) {
  const ver = crypto.createVerify('sha1WithRSAEncryption');
  ver.update(data);

  return ver.verify(yggdrasilPublicKey, Buffer.from(signature, 'base64'));
}