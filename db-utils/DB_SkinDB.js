const { Pool } = require('pg');
const pool = new Pool({
  host: require('./../storage/db.json')['host'],
  user: require('./../storage/db.json')['user'],
  password: require('./../storage/db.json')['password'],
  database: require('./../storage/db.json')['DB_SkinDB'],
  ssl: require('./../storage/db.json')['ssl'],
  max: 8
});
pool.on('error', (err, _client) => {
  console.error('Unexpected error on idle client:', err);
});

module.exports = {
  pool,

  /* Queue */
  /**
   * @param {String} skinURL 
   * @param {String} value 
   * @param {String} signature 
   * @param {Number} userAgent 
   * @param {Function} callback 
   */
  addQueue(skinURL, value, signature, userAgent, callback) {
    if (userAgent && userAgent.length > 255) {
      userAgent = userAgent.substring(0, 252) + '...';
    }

    pool.query(`INSERT INTO "Queue"("SkinURL", "Value", "Signature", "UserAgent") VALUES ($1, $2, $3, $4) RETURNING "ID";`,
      [skinURL, value, signature, userAgent], (err, res) => {
        if (err) return callback(err);

        callback(null, res.rows[0]['ID']);
      });
  },

  /**
   * @param {String} skinURL 
   * @param {function} callback 
   */
  isQueued(skinURL, callback) {
    pool.query(`SELECT EXISTS(SELECT from "Queue" WHERE "SkinURL"=$1) AS "exists";`,
      [skinURL], (err, res) => {
        if (err) return callback(err);

        callback(null, res.rows[0]['exists']);
      });
  },

  /**
   * @param {Number} id 
   * @param {Function} callback 
   */
  getQueue(id, callback) {
    pool.query(`SELECT * FROM "Queue" WHERE "ID"=$1;`,
      [id], (err, res) => {
        if (err) return callback(err);

        for (const key in res.rows) {
          if (res.rows.hasOwnProperty(key)) {
            // Use #rowToQueuedObject
            let result = res.rows[key];
            result['Added'] = new Date(result['Added']).toUTCString();

            return callback(null, result);
          }
        }

        return callback(null, null);
      });
  },

  /**
   * @param {Number} skinID 
   * @param {Function} callback 
   */
  getQueueBySkin(skinID, callback) {
    pool.query(`SELECT * FROM "Queue" WHERE "SkinID" =$1 AND "Status" ='SUCCESS'::"QueueStatus";`,
      [skinID], (err, res) => {
        if (err) return callback(err);

        for (const key in res.rows) {
          if (res.rows.hasOwnProperty(key)) {
            // Use #rowToQueuedObject
            let result = res.rows[key];
            result['Added'] = new Date(result['Added']).toUTCString();

            return callback(null, result);
          }
        }

        return callback(null, null);
      });
  },

  /* Queue: UserAgent */
  getAgentID(userAgent, callback) {
    pool.connect((err, con, done) => {
      if (err) return callback(err);

      con.query(`SELECT "ID" FROM "QueuingAgents" WHERE "Agent"=$1;`,
        [userAgent], (err, res) => {
          if (err) {
            done();
            return callback(err);
          }

          if (res.rowCount <= 0) {
            return con.query(`INSERT INTO "QueuingAgents" ("Agent") VALUES ($1) RETURNING "ID";`,
              [userAgent], (err, res) => {
                done();

                if (err) return callback(err);

                callback(null, res.rows[0]['ID']);
              });
          }
          done();

          return callback(null, res.rows[0]['ID']);
        });
    });
  },

  /* Skins */

  /**
   * 
   * @param {Number} id 
   * @param {Function} callback 
   */
  getSkin(id, callback) {
    pool.query(`SELECT * FROM "Skins" WHERE "ID"=$1;`,
      [id], (err, res) => {
        if (err) return callback(err);

        for (const key in res.rows) {
          if (res.rows.hasOwnProperty(key)) {
            // Use #rowToSkin
            let skin = res.rows[key];
            skin.urls = {
              mojang: skin['SkinURL'],
              clean: `https://cdn.skindb.net/skins/${skin['ID']}/skin.png`,
              original: `https://cdn.skindb.net/skins/${skin['ID']}/original.png`,
              render: `https://api.mineskin.org/render/skin?url=${encodeURIComponent(`https://cdn.skindb.net/skins/${skin['ID']}/skin.png`)}`
            };

            skin['Added'] = new Date(skin['Added']).toUTCString();

            return callback(null, skin);
          }
        }

        return callback(null, null);
      });
  },

  /**
   * @param {Number} count 
   * @param {Function} callback 
   */
  getRandomSkinList(count, callback) {
    pool.query(`SELECT * FROM "Skins" WHERE "DuplicateOf" IS NULL ORDER BY RANDOM() LIMIT $1;`,
      [count], (err, res) => {
        if (err) return callback(err);

        let skins = [];

        for (const key in res.rows) {
          if (res.rows.hasOwnProperty(key)) {
            // Use #rowToSkin
            let skin = res.rows[key];
            skin.urls = {
              mojang: skin['SkinURL'],
              clean: `https://cdn.skindb.net/skins/${skin['ID']}/skin.png`,
              original: `https://cdn.skindb.net/skins/${skin['ID']}/original.png`,
              render: `https://api.mineskin.org/render/skin?url=${encodeURIComponent(`https://cdn.skindb.net/skins/${skin['ID']}/skin.png`)}`
            };

            skin['Added'] = new Date(skin['Added']).toUTCString();

            skins.push(skin);
          }
        }

        return callback(null, skins);
      });
  },

  /**
   * @param {Number} id 
   * @param {'original'|'clean'} type
   * @param {Function} callback 
   */
  getSkinImage(id, type, callback) {
    if (typeof type !== 'string' || (type != 'original' && type != 'clean')) throw new Error(`Invalid value for type (=${type})`);

    pool.query(`SELECT ${type} FROM "Images" WHERE "SkinID"=$1;`,
      [id], (err, res) => {
        if (err) return callback(err);

        return callback(null, res.rowCount > 0 ? res.rows[0][type] : null);
      });
  },

  /* Tags */
  getTagSuggestion(name, limit = -1, callback) {
    pool.connect((err, con, done) => {
      if (err) return callback(err);

      const searchTerm = name.toLowerCase() + '%';

      con.query('SELECT "Name" FROM "Tags" WHERE "Name" LIKE $1 ORDER BY "ID" ASC' + (limit > 0 ? ` LIMIT ${limit}` : '') + ';',
        [searchTerm], (err, res) => {
          if (err) {
            done();
            return callback(err);
          }

          let suggestion = [];

          for (const row of res.rows) {
            if (limit > 0 && suggestion.length >= limit) break;

            suggestion.push(row['Name']);
          }

          con.query('SELECT * FROM (SELECT "ID", UNNEST ( "Aliases" ) "Tag" FROM "Tags" ORDER BY "ID" ASC)x WHERE "Tag" LIKE $1' + (limit > 0 ? ` LIMIT ${limit}` : '') + ';',
            [searchTerm], (err, res) => {
              done();
              if (err) return callback(err);

              for (const row of res.rows) {
                if (limit > 0 && suggestion.length >= limit) break;

                suggestion.push(row['Tag']);
              }

              return callback(null, suggestion);
            });
        });
    });
  },

  getMatchingTags(name, callback) {
    pool.query(`SELECT "ID" FROM "Tags" WHERE "Name" =$1 OR $1= ANY ("Aliases");`,
      [name.toLowerCase()], (err, res) => {
        if (err) return callback(err);

        let tagIDs = [];

        for (const row of res.rows) {
          tagIDs.push(row['ID']);
        }

        return callback(null, tagIDs);
      });
  },

  /* Misc. */

  /**
   * @param {Function} callback Params: err, json
   */
  getStats(callback) {
    pool.connect((err, con, done) => {
      if (err) return callback(err);

      con.query(`SELECT COUNT(*) FROM "Skins";`, [], (err, res) => {
        if (err) {
          done();
          return callback(err);
        }

        let estSkinCount = parseInt(res.rows[0]['count']),
          duplicateSkinCount, pendingCount;

        con.query(`SELECT COUNT(*) FROM "Skins" WHERE "DuplicateOf" IS NOT NULL;`, [], (err, res) => {
          if (err) {
            done();
            return callback(err);
          }

          duplicateSkinCount = res.rows[0]['count'];

          con.query(`SELECT COUNT(*) FROM "Queue" WHERE "Status" = 'QUEUED';`, [], (err, res) => {
            if (err) {
              done();
              return callback(err);
            }

            pendingCount = res.rows[0]['count'];

            con.query(`SELECT "QueuingAgents"."Agent", COUNT(*) FROM "Queue" INNER JOIN` +
              `"QueuingAgents" ON "Queue"."UserAgent" ="QueuingAgents"."ID" GROUP BY "QueuingAgents"."Agent" ORDER BY "count" DESC;`, [], (err, res) => {
                done();

                if (err) return callback(err);

                let providedBy = {};

                for (const row in res.rows) {
                  if (res.rows.hasOwnProperty(row)) {
                    const elem = res.rows[row];

                    providedBy[elem.Agent] = parseInt(elem['count']);
                  }
                }

                callback(null, {
                  estSkinCount: estSkinCount,
                  duplicateSkinCount: parseInt(duplicateSkinCount),
                  pendingCount: parseInt(pendingCount),
                  providedBy: providedBy,

                  lastUpdate: new Date().toUTCString()
                });
              });
          });
        });
      });
    });
  },

  /**
   * @param {Function} callback Params: err, json
   */
  getAdvancedStats(callback) {
    pool.connect((err, con, done) => {
      if (err) return callback(err);

      con.query(`SELECT COUNT(*) FROM "Skins" WHERE "Added" >= CURRENT_DATE;`, [], (err, res) => {
        if (err) {
          done();
          return callback(err);
        }

        let last24h = parseInt(res.rows[0]['count']),
          base, amountOverDays = [];

        con.query(`SELECT COUNT(*) FROM "Skins" WHERE "Added" <= CURRENT_DATE - 13;`, [], (err, res) => {
          if (err) {
            done();
            return callback(err);
          }

          base = parseInt(res.rows[0]['count']);

          con.query(`SELECT DATE_TRUNC('day', "Added") AS "date", COUNT(*) AS "count" FROM "Skins" GROUP BY 1 ORDER BY 1 DESC LIMIT 14;`, [], (err, res) => {
            done();
            if (err) return callback(err);

            for (const row of res.rows.reverse()) {
              base += parseInt(row['count']);

              amountOverDays.push({
                date: new Date(row['date']).toUTCString(),
                count: base
              });
            }

            callback(null, {
              last24h: last24h,
              changeOverDays: amountOverDays,

              lastUpdate: new Date().toUTCString()
            });
          });
        });
      });
    });
  }
};