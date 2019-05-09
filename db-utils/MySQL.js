const cfg = require('./../storage/db.json');
const pool = require('mysql').createPool(cfg);

// ToDo create tables

module.exports = {
  cfg, pool,
  escape: require('mysql').escape
};