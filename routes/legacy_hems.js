const router = require('express').Router();

const db = require('./../db-utils/legacy_hems');

const NodeCache = require('node-cache');
const cache = new NodeCache({
  stdTTL: 60 * 5
});

router.get('/lifeCO2Sim2k19', (req, res, next) => {
  if (!cache.keys().includes('scoreboard')) {
    db.getAll((err, entries) => {
      if (err) {
        next(err);
        return;
      }

      cache.set('scoreboard', entries);

      let aroundScore = Number.parseInt(req.query.aroundScore);
      let aroundID = Number.parseInt(req.query.aroundID);

      if (aroundScore) {
        /* [Start] Verhindert lächerlich abweichende Werte */
        let lowestScore = aroundScore,
          highestScore = aroundScore;
        for (const entry of entries) {
          if (entry.score < lowestScore) {
            lowestScore = entry.score;
          }

          if (entry.score > highestScore) {
            highestScore = entry.score;
          }
        }

        if (aroundScore < lowestScore) {
          aroundScore = lowestScore;
        } else if (aroundScore > highestScore) {
          aroundScore = highestScore;
        }
        /* [Ende] Lächerliche Werte */


        let jsonRes = [];

        let currOffset = 0;

        while (jsonRes.length < 10 && jsonRes.length <= entries.length) {
          for (const entry of entries) {
            if (entry.score === (aroundScore + currOffset) ||
              entry.score === (aroundScore - currOffset)) {
              jsonRes.push(entry);
            }
          }

          currOffset++;
        }

        jsonRes.sort((a, b) => {
          return a.rank > b.rank;
        });

        res.json(jsonRes);
      } else if (aroundID) {
        /* [Start] Verhindert lächerlich abweichende Werte */
        let lowestID = aroundID,
          highestID = aroundID;
        for (const entry of entries) {
          if (entry.id < lowestID) {
            lowestID = entry.id;
          }

          if (entry.id > highestID) {
            highestID = entry.id;
          }
        }

        if (aroundID < lowestID) {
          aroundID = lowestID;
        } else if (aroundID > highestID) {
          aroundID = highestID;
        }
        /* [Ende] Lächerliche Werte */


        let jsonRes = [];

        let currID = aroundID - 5;

        let rank;

        for (const entry of entries) {
          if (entry.id === aroundID) {
            rank = entry.rank;
          }
        }

        if (rank) {
          while (jsonRes.length < 10 && jsonRes.length <= entries.length && currID < aroundID + 10) {
            for (const entry of entries) {
              if (entry.id === currID) {
                jsonRes.push(entry);
              }
            }

            currID++;
          }

          jsonRes.sort((a, b) => {
            return a.rank > b.rank;
          });

          res.json(jsonRes);
        } else {
          res.json({
            error: 'Invalid ID'
          });
        }
      } else {
        res.json(entries);
      }
    });
  } else {
    res.json(cache.get('scoreboard'));
  }
});

router.post('/lifeCO2Sim2k19', (req, res, next) => {
  if (req.body && req.body.name !== undefined && req.body.score !== undefined) {
    const name = req.body.name;

    if (name.length <= 255) {
      const score = req.body.score;

      db.add(name, score, (err, rowID) => {
        if (err) {
          return next(err);
        }

        cache.flushAll();
        // cache.del('scoreboard');

        // TODO RowID != ID - API muss geziehlt eine bestimmte row abrufen und die ID getten.
        // TODO Send entry-Object
        res.json({
          success: true,
          id: rowID
        });
      });
    } else {
      var error = new Error('Username too long (max. 255)');
      error.statusCode = 400;
      error.status = '???';

      next(error);
    }
  } else {
    var error = new Error('Invald request body');
    error.statusCode = 400;
    error.status = '???';

    next(error);
  }
});

module.exports = router;