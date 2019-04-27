const mysql = require('./MySQL');
const net = require('net');

const Utils = require('./../utils');

const db = mysql.cfg['DB_SkinDB'];

module.exports = {
  /* Provide */

  /**
   * @param {Number} pendingID 
   * @param {Function} callback Params: err, status | status is {} if success but no status for ID
   */
  getPending(pendingID, callback) {
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(`SELECT * FROM \`${db}\`.\`Pending\` WHERE \`ID\`=?;`, [pendingID], (err, rows, _fields) => {
        con.release();

        if (err) return callback(err);

        callback(null, (rows.length > 0) ? JSON.parse(JSON.stringify(rows[0])) : {});
      });
    });
  },
  getPendingByData(skinData, callback) {
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(`SELECT * FROM \`${db}\`.\`Pending\` WHERE \`SkinData\`=?;`, [skinData], (err, rows, _fields) => {
        con.release();

        if (err) return callback(err);

        callback(null, (rows.length > 0) ? JSON.parse(JSON.stringify(rows[0])) : {});
      });
    });
  },

  addPending(skinURL, userAgent, callback) {
    if (userAgent.length > 255) {
      userAgent = userAgent.substring(1, 253) + '...';
    }

    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(`INSERT INTO \`${db}\`.\`Pending\`(\`SkinData\`,\`UserAgent\`) VALUE (?,?);`, [skinURL, userAgent], (err, _rows, _fields) => {
        con.release();

        if (err) return callback(err);

        module.exports.getPendingByData(skinURL, (err, pending) => {
          callback(err, pending);
        });

        // Notify backend
        let client = new net.Socket();
        client.on('data', () => {
          client.destroy();
        });
        client.on('error', (err) => {
          if (err.code !== 'ECONNREFUSED') {
            console.error(err);
          }
        });
        client.connect(7999, '127.0.0.1', () => {
          client.write('newPending' + Utils.EOL);
        });
      });
    });
  },

  /**
   * @param {String} skinURL 
   * @param {Function} callback 
   */
  isPendingOrInDB(skinURL, callback) {
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(`SELECT \`ID\` FROM \`${db}\`.\`Skins\` WHERE \`MojangURL\`=?;`, [skinURL], (err, rows, _fields) => {
        if (err) {
          con.release();
          return callback(err);
        }

        if (rows.length > 0) {
          con.release();
          return callback(null, true);
        }

        con.query(`SELECT \`ID\` FROM \`${db}\`.\`Pending\` WHERE \`SkinData\`=?;`, [skinURL], (err, rows, _fields) => {
          con.release();

          if (err) return callback(err);

          callback(null, rows.length > 0);
        });
      });
    });
  },

  /* Skin */

  /**
   * @param {Number} skinID 
   * @param {Function} callback Params: err, skin | skin is {} if success but no skin for ID
   */
  getSkin: function (skinID, callback) {
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(`SELECT * FROM \`${db}\`.\`Skins\` WHERE \`ID\`=?;`, [skinID], (err, rows, _fields) => {
        con.release();

        if (err) return callback(err);

        callback(null, (rows.length > 0) ? rowToSkin(rows[0]) : {});
      });
    });
  },

  /**
  * @param {Number} count 
  * @param {Number} page
  * @param {Boolean} sortDESC
  * @param {Function} callback Params: err, skins | skins is an array
  */
  getSkinList: function (count, page, sortDESC, callback) {
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      let offset = ((page < 0) ? 0 : page - 1) * count;
      con.query(`SELECT * FROM \`${db}\`.\`Skins\` WHERE \`DuplicateOf\` IS NULL ORDER BY \`ID\` ${sortDESC ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?;`,
        [count, offset], (err, rows, _fields) => {
          con.release();

          if (err) return callback(err);

          let skins = [];

          for (const row in rows) {
            if (rows.hasOwnProperty(row)) {
              skins.push(rowToSkin(rows[row]));
            }
          }

          return callback(null, skins);
        });
    });
  },

  /**
   * @param {Number} count 
   * @param {Function} callback Params: err, skins | skins is an array
   */
  getRandomSkinList: function (count, callback) {
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(`SELECT * FROM \`${db}\`.\`Skins\` WHERE \`DuplicateOf\` IS NULL ORDER BY RAND() LIMIT ?;`,
        [count], (err, rows, _fields) => {
          con.release();

          if (err) return callback(err);

          let skins = [];

          for (const row in rows) {
            if (rows.hasOwnProperty(row)) {
              skins.push(rowToSkin(rows[row]));
            }
          }

          return callback(null, skins);
        });
    });
  },

  /* Skin-Meta */

  /**
   * @param {Function} callback Params: err, json
   */
  getSkinMeta: function (skinID, callback) {
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(`SELECT * FROM \`${db}\`.\`MetaData\` WHERE \`ID\` = ?;`, [skinID], (err, rows, fields) => {
        con.release();

        if (err) return callback(err);

        let meta = {};

        for (const field of fields) {
          let rowVal;

          if (rows.length > 0) {
            rowVal = rows[0][field.name];

            if (!rowVal && field.name === 'ID') {
              rowVal = skinID;
            } else if (field.name === 'WearsHat' || field.name === 'WearsMask') {
              rowVal = Utils.toBoolean(rowVal);
            }
          }

          meta[field.name] = rowVal === undefined ? null : rowVal;
        }

        return callback(null, meta);
      });
    });
  },

  /**
   * @param {object} meta 
   * @param {string} meta.CharacterName 
   * @param {string} meta.CharacterURL 
   * @param {string} meta.SkinOriginName 
   * @param {string} meta.SkinOriginURL 
   * @param {boolean} meta.WearsMask 
   * @param {string} meta.MaskCharacterName 
   * @param {string} meta.MaskCharacterURL 
   * @param {string} meta.CharacterName 
   * @param {boolean} meta.WearsHat
   * @param {string} meta.HatType
   * @param {string} meta.Job
   * @param {string} meta.Accessories
   * @param {string} meta.MiscTags
   * @param {number} meta.Sex
   * @param {number} meta.Age
   * @param {number} meta.HairLength
   * @param {Function} callback Params: err
   */
  setSkinMeta: function (skinID, meta, callback) {
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      // ToDo Use REPLACE instead
      con.query('INSERT INTO `' + db + '`.`MetaData`(`ID`,`CharacterName`,`CharacterURL`,`SkinOriginName`,`SkinOriginURL`,' +
        '`Sex`,`Age`,`WearsMask`,`MaskCharacterName`,`MaskCharacterURL`,`WearsHat`,`HatType`,`HairLength`,`Job`,`Accessories`,`MiscTags`)' +
        'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE `CharacterName`=?,`CharacterURL`=?,`SkinOriginName`=?,`SkinOriginURL`=?,' +
        '`Sex`=?,`Age`=?,`WearsMask`=?,`MaskCharacterName`=?,`MaskCharacterURL`=?,`WearsHat`=?,`HatType`=?,`HairLength`=?,`Job`=?,`Accessories`=?,`MiscTags`=?;',
        [skinID, meta.CharacterName, meta.CharacterURL, meta.SkinOriginName, meta.SkinOriginURL, meta.Sex, meta.Age, meta.WearsMask, meta.MaskCharacterName,
          meta.MaskCharacterURL, meta.WearsHat, meta.HatType, meta.HairLength, meta.Job, meta.Accessories, meta.MiscTags,
          meta.CharacterName, meta.CharacterURL, meta.SkinOriginName, meta.SkinOriginURL, meta.Sex, meta.Age, meta.WearsMask, meta.MaskCharacterName,
          meta.MaskCharacterURL, meta.WearsHat, meta.HatType, meta.HairLength, meta.Job, meta.Accessories, meta.MiscTags],
        (err, _rows, _fields) => {
          con.release();

          callback(err || null);
        });
    });
  },

  /* Misc */

  /**
   * @param {Function} callback Params: err, json
   */
  getStats: function (callback) {
    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(`SHOW INDEX FROM \`${db}\`.\`Skins\`;`, [], (err, rows, _fields) => {
        if (err) {
          con.release();
          return callback(err);
        }

        let estSkinCount = rows[0]['Cardinality'],
          duplicateSkinCount, pendingCount;

        con.query(`SELECT COUNT(*) AS "RowCount" FROM \`${db}\`.\`Skins\` WHERE \`DuplicateOf\` IS NOT NULL;`, [], (err, rows, _fields) => {
          if (err) {
            con.release();
            return callback(err);
          }

          duplicateSkinCount = rows[0]['RowCount'];

          con.query(`SELECT COUNT(*) AS "RowCount" FROM \`${db}\`.\`Pending\` WHERE \`Status\` IS NULL;`, [], (err, rows, _fields) => {
            if (err) {
              con.release()
              return callback(err);
            }

            pendingCount = rows[0]['RowCount'];

            con.query(`SELECT \`UserAgent\`, COUNT(*) AS "Count" FROM \`${db}\`.\`Pending\` GROUP BY \`UserAgent\`;`, [], (err, rows, _fields) => {
              con.release();

              if (err) return callback(err);

              let providedBy = {};

              for (const row in rows) {
                if (rows.hasOwnProperty(row)) {
                  const elem = rows[row];

                  providedBy[elem.UserAgent] = elem.Count;
                }
              }

              callback(null, {
                estSkinCount: estSkinCount,
                duplicateSkinCount: duplicateSkinCount,
                pendingCount: pendingCount,
                providedBy: providedBy,

                lastUpdate: Date.now()
              });
            });
          });
        });
      });
    });
  }
};

function rowToSkin(row) {
  let skin = {
    id: row['ID'],
    Skin: {
      cleanHash: row['CleanHash'],
      overlay: Utils.toBoolean(row['HasOverlay']),
      steveArms: Utils.toBoolean(row['HasSteveArms'])
    },
    urls: {
      mojang: row['MojangURL'],
      clean: `https://assets.skindb.net/skins/${row['ID']}/skin.png`,
      original: `https://assets.skindb.net/skins/${row['ID']}/original.png`
    }
  };
  skin.urls.render = 'https://api.mineskin.org/render/skin?url=' + encodeURI(skin.urls.clean);

  if (row['DuplicateOf']) {
    skin.duplicateOf = row['DuplicateOf'];
  }

  return skin;
}