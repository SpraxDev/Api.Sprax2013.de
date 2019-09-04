const { Pool } = require('pg');
const pool = new Pool({
  host: require('./../storage/db.json')['host'],
  user: require('./../storage/db.json')['user'],
  password: require('./../storage/db.json')['password'],
  database: require('./../storage/db.json')['DB_Mojang'],
  max: 12,
  ssl: true
});
pool.on('error', (err, _client) => {
  console.error('Unexpected error on idle client:', err);
  // process.exit(-1);
});
// call `pool.end()` to shutdown the pool (waiting for queries to finish)

const Utils = require('./../utils');

module.exports = {
  pool,

  setHost(host, hash, callback) {
    pool.query(`INSERT INTO "Domains"("Host", "Hash") VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
      [host, hash], (err, _res) => {
        callback(err || null);
      });
  },

  getHost(hashes, callback) {
    pool.connect((err, client, done) => {
      if (err) return callback(err);

      let sqlQuery = 'SELECT * FROM "Domains"';
      if (typeof hashes === 'string') {
        sqlQuery += ' WHERE "Domains"."Hash"=' + client.escapeLiteral(hashes);
      } else {
        for (const hash of hashes) {
          if (sqlQuery.indexOf('WHERE') > 0) {
            sqlQuery += ' OR';
          } else {
            sqlQuery += ' WHERE';
          }

          sqlQuery += ' "Domains"."Hash"=' + client.escapeLiteral(hash);
        }
      }
      sqlQuery += ' ORDER BY "Domains"."Host" ASC;';

      client.query(sqlQuery, [], (err, res) => {
        done();
        if (err) return callback(err);

        let json = {};

        for (const row in res.rows) {
          if (res.rows.hasOwnProperty(row)) {
            let elem = res.rows[row];

            json[elem.Host] = elem.Hash;
          }
        }

        callback(null, json);
      });
    });
  },

  /**
   * @param {Function} callback 
   */
  getDatabaseSize(callback) {
    pool.query(`SELECT "reltuples" AS "approximate_row_count" FROM "pg_class" WHERE "relname" = 'Domains';`,
      [], (err, res) => {
        if (err) return callback(err);

        callback(null, res.rows[0]['approximate_row_count']);
      });
  },

  updateGameProfile(profile, texture, callback) {
    pool.query('INSERT INTO "GameProfiles"("UUID", "Username", "TextureValue", "TextureSignature", "SkinURL", "CapeURL") VALUES ($1, $2, $3, $4, $5, $6) ' +
      'ON CONFLICT("UUID") DO UPDATE SET "Username"=$2, "TextureValue"=$3, "TextureSignature"=$4, "SkinURL"=$5, "CapeURL"=$6, "LastUpdate"=CURRENT_TIMESTAMP;',
      [profile['id'], profile['name'], texture.value, texture.signature, texture.skinURL, texture.capeURL], (err, _res) => {
        callback(err || null);
      });
  }
};