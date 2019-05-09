const mysql = require('./MySQL');
const escape = require('mysql').escape;

const db = mysql.cfg['DB_Mojang'];

module.exports = {
  setHost(host, hash, callback) {
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(`INSERT IGNORE INTO \`${db}\`.\`Domains\`(\`Host\`,\`Hash\`) VALUE (?,?);`, [host, hash], (err, rows, _fields) => {
        con.release();

        callback(err || null);
      });
    });
  },

  getHost(hashes, callback) {
    let sqlQuery = `SELECT * FROM \`${db}\`.\`Domains\``;

    if (typeof hashes === 'string') {
      sqlQuery += ' WHERE `Hash`=' + mysql.escape(hashes);
    } else {
      for (const hash of hashes) {
        if (sqlQuery.indexOf('WHERE') > 0) {
          sqlQuery += ' OR';
        } else {
          sqlQuery += ' WHERE';
        }

        sqlQuery += ' `Hash`=' + mysql.escape(hash);
      }
    }
    sqlQuery += ' ORDER BY `Host` ASC;';

    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(sqlQuery, [], (err, rows, _fields) => {
        con.release();

        if (err) return callback(err);

        let json = {};

        for (const row in rows) {
          if (rows.hasOwnProperty(row)) {
            let elem = rows[row];

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
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(`SHOW INDEX FROM \`${db}\`.\`Domains\`;`, [], (err, rows, _fields) => {
        con.release();

        if (err) return callback(err);

        callback(null, rows[0].Cardinality);
      });
    });
  }
};