import { Router } from 'express';

import { restful, setCaching } from '../utils/utils';

const router = Router();
export const statusExpressRouter = router;

router.all('/', (req, res, _next) => {
  restful(req, res, {
    get: () => {
      res.locals.timings?.stopCurrent();  // Force 'init' timing to be sent

      setCaching(res, false, true)
          .send({
            api: 'OK'
          });
    }
  });
});