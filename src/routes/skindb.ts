import * as tmImage from '@teachablemachine/image';
import canvas = require('canvas');
import { Router } from 'express';
import { JSDOM } from 'jsdom';

import { db } from '..';
import { CleanMinecraftUser } from '../global';
import { ApiError, ErrorBuilder, isNumber, isUUID, restful } from '../utils';
import { getByUsername, getByUUID } from './minecraft';

/* AI */
(global as any).document = new JSDOM('<body></body>').window.document;
(global as any).fetch = require('node-fetch');

const AI_MODELS: { [key: string]: null | tmImage.CustomMobileNet } = {
  GENDER: null
};
(async () => {
  AI_MODELS.GENDER = await tmImage.load('https://sprax2013.de/ai/gender/model.json', 'https://sprax2013.de/ai/gender/metadata.json');
})();

/* Routes */
const router = Router();
export const skindbExpressRouter = router;

router.all('/import', (req, res, next) => {
  // user (uuid, name), texture-value (+signature), file(s), URL

  restful(req, res, {
    post: () => {
      const contentType = (req.headers['content-type'] || '').toLowerCase();

      if (contentType == 'application/json') {
        const json: { user?: string, raw?: { value: string, signature?: string } } = req.body;

        if (json.user) {
          if (json.user.length <= 16) {
            getByUsername(json.user, null, (err, apiRes) => {
              if (err) return next(err);
              if (!apiRes) return next(new ErrorBuilder().notFound('UUID for given username'));

              getByUUID(apiRes.id, req, (err, mcUser) => {
                if (err) return next(err);
                if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given username'));

                res.send(mcUser);
              });
            });
          } else if (isUUID(json.user)) {
            getByUUID(json.user, req, (err, mcUser) => {
              if (err) return next(err);
              if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given uuid'));

              res.send(mcUser);
            });
          } else {
            return next(new ErrorBuilder().invalidBody([]));  //TODO
          }
        } else {
          return next(new ErrorBuilder().invalidBody([]));  //TODO
        }
      } else {
        res.sendStatus(400);
      }
    }
  });
});

router.all('/search', (req, res, next) => {
  // Currently supported: user (uuid, name)

  restful(req, res, {
    get: () => {
      if (typeof req.query.q != 'string') return next(new ErrorBuilder().invalidParams('query', [{ param: 'q', condition: 'Is string' }]));
      if (!req.query.q || req.query.q.trim() <= 128) return next(new ErrorBuilder().invalidParams('query', [{ param: 'q', condition: 'q.length > 0 and q.length <= 128' }]));

      const query: string = req.query.q.trim();
      let waitingFor = 0;

      const result: { profiles?: { direct?: CleanMinecraftUser[], indirect?: CleanMinecraftUser[] } } = {};

      const sendResponse = (): void => {
        if (waitingFor == 0) {
          res.send(result);
        }
      };

      if (query.length <= 16) {
        waitingFor++;

        getByUsername(query, null, (err, apiRes) => {
          if (err) ApiError.log(`Searching by username for ${query} failed`, err);

          if (apiRes) {
            getByUUID(apiRes.id, req, (err, mcUser) => {
              if (err) ApiError.log(`Searching by username for ${query} failed`, err);

              if (mcUser) {
                if (!result.profiles) result.profiles = {};
                if (!result.profiles.direct) result.profiles.direct = [];

                result.profiles.direct.push(mcUser.toCleanJSON());
              }

              waitingFor--;
              sendResponse();
            });
          } else {
            waitingFor--;

            if (waitingFor == 0) {
              res.send(result);
            }
          }
        });
      } else if (isUUID(query)) {
        waitingFor++;

        getByUUID(query, req, (err, mcUser) => {
          if (err) ApiError.log(`Searching by uuid for ${query} failed`, err);

          if (mcUser) {
            if (!result.profiles) result.profiles = {};
            if (!result.profiles.direct) result.profiles.direct = [];

            result.profiles.direct.push(mcUser.toCleanJSON());
          }

          waitingFor--;
          sendResponse();
        });
      }

      sendResponse();
    }
  });
});

router.all('/ai/:model?', async (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.model || !AI_MODELS.hasOwnProperty(req.params.model.toUpperCase())) return next(new ErrorBuilder().invalidParams('url', [{ param: 'model', condition: `Equal (ignore case) one of the following: ${Object.keys(AI_MODELS).join('", "')}` }]));

      if (!req.query.skin) return next(new ErrorBuilder().invalidParams('query', [{ param: 'skin', condition: 'skin.length > 0' }]));
      if (!isNumber(req.query.skin)) return next(new ErrorBuilder().invalidParams('query', [{ param: 'skin', condition: 'Is numeric string (0-9)' }]));

      const skinID = req.query.skin;
      const model = AI_MODELS[req.params.model.toUpperCase()];

      if (!model) {
        res.set('Retry-After', '2');
        return next(new ErrorBuilder().serviceUnavailable('This AI model is still being initialized'));
      }

      db.getSkinImage(skinID, 'clean', (err, skin) => {
        if (err) return next(err);
        if (!skin) return next(new ErrorBuilder().notFound('Image for given skin'));

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