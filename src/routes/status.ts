import { Router } from 'express';

import { restful, setCaching } from '../utils';

const router = Router();
export const statusExpressRouter = router;

router.all('/', (req, res, _next) => {
  restful(req, res, {
    get: () => {
      setCaching(res, false, true)
        .send({
          api: 'OK'
        });
    }
  });
});