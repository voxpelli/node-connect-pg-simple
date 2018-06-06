'use strict';

const pathModule = require('path');

const dotEnvFile = process.env.DOTENV_FILE || pathModule.resolve(__dirname, './.env');

require('dotenv').config({ path: dotEnvFile });

const conObject = {
  database: process.env.PGDATABASE || 'connect_pg_simple_test'
};

const denodeify = require('denodeify');
const pg = require('pg');

const pool = new pg.Pool(conObject);

const readFile = denodeify(require('fs').readFile);

const tables = ['session'];

const removeTables = function () {
  return Promise.all(tables.map(table => pool.query('DROP TABLE IF EXISTS ' + table)));
};

const initTables = function () {
  return readFile(pathModule.resolve(__dirname, '../table.sql'), 'utf8')
    .then(tableDef => pool.query(tableDef));
};

module.exports = Object.freeze({
  conObject,
  queryPromise: pool.query.bind(pool),
  removeTables,
  initTables
});
