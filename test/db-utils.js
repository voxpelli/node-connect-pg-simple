'use strict';

const pathModule = require('path');

const denodeify = require('denodeify');
const pg = require('pg');
const pool = new pg.Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'connect_pg_simple_test'
});

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
  conString: 'postgres://postgres@localhost/connect_pg_simple_test',
  queryPromise: pool.query.bind(pool),
  removeTables,
  initTables
});
