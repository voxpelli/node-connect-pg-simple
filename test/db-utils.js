// @ts-check

'use strict';

const fs = require('fs').promises;
const pathModule = require('path');

const pg = require('pg');

const dotEnvFile = process.env.DOTENV_FILE || pathModule.resolve(__dirname, './.env');

require('dotenv').config({ path: dotEnvFile });

const conObject = {
  database: process.env.PGDATABASE || 'connect_pg_simple_test'
};

const pool = new pg.Pool(conObject);

const tables = ['session'];

const removeTables = async () => {
  return Promise.all(tables.map(table => pool.query('DROP TABLE IF EXISTS ' + table)));
};

const initTables = async () => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const tableDef = await fs.readFile(pathModule.resolve(__dirname, '../table.sql'), 'utf8');
  return pool.query(tableDef);
};

module.exports = Object.freeze({
  conObject,
  queryPromise: pool.query.bind(pool),
  removeTables,
  initTables
});
