import { Router } from 'express';

import { restful, isUUID, ErrorBuilder, isNumber } from '../utils';
import { db } from '..';
import { SkinDBAccount, SkinDBSkin } from '../global';
import { getByUUID } from './minecraft';

/* Routes */
const router = Router();
export const skindbFrontendExpressRouter = router;

//TODO: Check API-Token
// router.use((req, res, next) => {
// if (invalidApiToken) next(new ErrorBuilder().noPermsAuthorizedOrSomething);
//
// next(); // valid API-Token
// });

router.all('/account/:uuid', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!db.isAvailable()) return next(new ErrorBuilder().serviceUnavailable('SkinDB-Frontend route can only work while using a database'));
      if (!isUUID(req.params.uuid)) return next(new ErrorBuilder().invalidParams('url', [{ param: 'uuid', condition: 'Valid UUID v4' }]));

      const uuid: string = req.params.uuid.toLowerCase().replace(/-/g, '');

      getByUUID(uuid, req, async (err, user) => {
        if (err || !user) return next(err || new Error());

        const history: number[] = await db.getSkinHistory(uuid, 10, 0);
        const historyTotal = history.length < 10 ? history.length : await db.getSkinHistorySize(uuid);

        const result: SkinDBAccount = {
          user: user.toCleanJSON(),
          skinHistory: {
            lastTen: history,
            total: historyTotal
          }
        };

        res.send(result);
      }, true);
    }
  });
});

router.all('/skin/:skinID', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!db.isAvailable()) return next(new ErrorBuilder().serviceUnavailable('SkinDB-Frontend route can only work while using a database'));
      if (!isNumber(req.params.skinID)) return next(new ErrorBuilder().invalidParams('url', [{ param: 'skinID', condition: 'Numeric string' }]));

      db.getSkin(req.params.skinID)
        .then((skin) => {
          if (!skin) return next(new ErrorBuilder().notFound('skin for that id'));

          const result: SkinDBSkin = {
            skin
          };

          res.send(result);
        })
        .catch(next);
    }
  });
});