const mysql = require('./MySQL');

const Utils = require('./../utils');

const db = mysql.cfg['DB_SkinDB'];

module.exports = {
  /* Skin */

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
* @param {Number|Array<Number>} ids 
* @param {Function} callback Params: err, skins | skins is an array
*/
  getSkinListFromID: function (skinIDs, callback) {
    let sqlQuery = `SELECT * FROM \`${db}\`.\`Skins\``;

    if (typeof skinIDs === 'number') {
      sqlQuery += ' WHERE `ID`=' + skinIDs;
    } else {
      for (const skinID of skinIDs) {
        if (typeof skinID !== 'number') break;

        if (sqlQuery.indexOf('WHERE') > 0) {
          sqlQuery += ' OR';
        } else {
          sqlQuery += ' WHERE';
        }

        sqlQuery += ' `ID`=' + skinID;
      }
    }
    sqlQuery += ';';

    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      con.query(sqlQuery, [], (err, rows, _fields) => {
        con.release();

        if (err) return callback(err);

        let skins = [];

        for (const row in rows) {
          if (rows.hasOwnProperty(row)) {
            skins.push(rowToSkin(rows[row]));
          }
        }

        callback(null, skins);
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

  searchSkin: function (sex, age, hairLength, tags, count, page, callback) {
    let sqlQuery = `SELECT * FROM \`${db}\`.\`MetaData\``;

    if (sex != null && Number.isSafeInteger(sex)) {
      if (sqlQuery.indexOf('WHERE') > 0) {
        sqlQuery += ' OR';
      } else {
        sqlQuery += ' WHERE';
      }

      sqlQuery += ' `Sex`=' + sex;
    }
    if (age != null && Number.isSafeInteger(age)) {
      if (sqlQuery.indexOf('WHERE') > 0) {
        sqlQuery += ' OR';
      } else {
        sqlQuery += ' WHERE';
      }

      sqlQuery += ' `Age`=' + age;
    }
    if (hairLength != null && Number.isSafeInteger(hairLength)) {
      if (sqlQuery.indexOf('WHERE') > 0) {
        sqlQuery += ' OR';
      } else {
        sqlQuery += ' WHERE';
      }

      sqlQuery += ' `HairLength`=' + hairLength;
    }

    for (const tag of tags) {
      for (const field of ['CharacterName', 'SkinOriginName', 'MaskCharacterName', 'HatType', 'Job', 'Accessories', 'MiscTags']) {
        if (sqlQuery.indexOf('WHERE') > 0) {
          sqlQuery += ' OR';
        } else {
          sqlQuery += ' WHERE';
        }

        sqlQuery += ' `' + field + '` LIKE ' + mysql.escape('%' + tag + '%');
      }
    }
    sqlQuery += ' LIMIT ? OFFSET ?;';

    mysql.pool.getConnection((err, con) => {
      if (err) return callback(err);

      let offset = ((page < 0) ? 0 : page - 1) * count;
      con.query(sqlQuery, [count, offset], (err, rows, _fields) => {
        if (err) {
          con.release();
          return callback(err);
        }

        let skinIDs = [];

        for (const row in rows) {
          if (rows.hasOwnProperty(row)) {
            skinIDs.push(rows[row]['ID']);
          }
        }

        if (skinIDs.length === 0) {
          con.release();

          return callback(null, { total: 0, results: [] });
        }

        con.query(`SELECT COUNT(*) AS 'Total' FROM ` + sqlQuery.substring(sqlQuery.indexOf(`\`${db}\`.\`MetaData\``), sqlQuery.lastIndexOf(' LIMIT')) + ';',
          [], (err, rows2, _fields2) => {
            con.release();

            if (err) return callback(err);

            module.exports.getSkinListFromID(skinIDs, (err, skins) => {
              if (err) return callback(err);

              callback(null, {
                total: rows2[0]['Total'],
                results: skins
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