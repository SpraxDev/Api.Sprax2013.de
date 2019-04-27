var mysql = require('mysql');

var db_config = require('./../storage/legacy_Hems.json');

var con;

function handleDisconnect() {
    con = mysql.createConnection(db_config);

    con.connect(function (err) { // The server is either down
        if (err) { // or restarting (takes a while sometimes).
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
        } // to avoid a hot loop, and to allow our node script to
    }); // process asynchronous requests in the meantime.
    // If you're also serving http, display a 503 error.

    con.on('error', function (err) {
        console.log('db error', err);

        if (err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
            handleDisconnect(); // lost due to either server restart, or a
        } else { // connnection idle timeout (the wait_timeout server variable configures this)
            throw err;
        }
    });
}

handleDisconnect();

// Create Table
con.query('CREATE TABLE IF NOT EXISTS `LifeCO2Sim2k19_ScoreBoard`(`ID` INT NOT NULL AUTO_INCREMENT, `Name` TINYTEXT NOT NULL,' +
    '`Score` INT NOT NULL, `Timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (`ID`))ENGINE = InnoDB CHARSET=utf8 COLLATE utf8_unicode_ci;',
    (err) => {
        if (err) {
            // log error to file
            throw err;
        }
    });

module.exports = {
    con,
    getAll: function (callback) {
        con.query('SELECT * FROM `LifeCO2Sim2k19_ScoreBoard` ORDER BY `Score` ASC;', (err, rows, fields) => {
            if (err) {
                callback(err);
            } else {
                var entries = [];

                let rank = 1;
                for (const row in rows) {
                    if (rows.hasOwnProperty(row)) {
                        const elem = rows[row];

                        entries.push({
                            id: elem.ID,
                            rank: rank,
                            name: elem.Name,
                            score: elem.Score,
                            timestamp: elem.Timestamp
                        });

                        rank++;
                    }
                }

                callback(null, entries);
            }
        });
    },
    add: function (name, score, callback) {
        con.query('INSERT INTO `LifeCO2Sim2k19_ScoreBoard`(`Name`,`Score`) VALUE (?,?);', [name, score], (err, dbRes) => {
            callback(err, dbRes.insertId);
        });
    }
};