// @ts-check

'use strict';

const fs = require('node:fs').promises;
const pathModule = require('node:path');

const pg = require('pg');

// eslint-disable-next-line n/no-process-env
const dotEnvFile = process.env['DOTENV_FILE'] || pathModule.resolve(__dirname, './.env');

require('dotenv').config({ path: dotEnvFile });

const conObject = {
  // eslint-disable-next-line n/no-process-env
  database: process.env['PGDATABASE'] || 'connect_pg_simple_test',
};

const pool = new pg.Pool(conObject);

const tables = ['session'];

/** @returns {Promise<void>} */
const removeTables = async () => {
  await Promise.all(tables.map(table => pool.query('DROP TABLE IF EXISTS ' + table)));
};

/** @returns {Promise<void>} */
const initTables = async () => {
  const tableDef = await fs.readFile(pathModule.resolve(__dirname, '../table.sql'), 'utf8');
  await pool.query(tableDef);
};

module.exports = Object.freeze({
  conObject,
  queryPromise: pool.query.bind(pool),
  removeTables,
  initTables,
});
