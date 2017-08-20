# Connect PG Simple

A simple, minimal PostgreSQL session store for Express/Connect

[![Build Status](https://travis-ci.org/voxpelli/node-connect-pg-simple.svg?branch=master)](https://travis-ci.org/voxpelli/node-connect-pg-simple)
[![Coverage Status](https://img.shields.io/coveralls/voxpelli/node-connect-pg-simple.svg)](https://coveralls.io/r/voxpelli/node-connect-pg-simple)
[![Dependency Status](https://gemnasium.com/voxpelli/node-connect-pg-simple.svg)](https://gemnasium.com/voxpelli/node-connect-pg-simple)
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat)](https://github.com/Flet/semistandard)

## Installation

```bash
npm install connect-pg-simple
```

Once npm installed the module, you need to create the **session** table in your database. For that you can use the [table.sql](table.sql) file provided with the module:

```bash
psql mydatabase < node_modules/connect-pg-simple/table.sql
```

Or simply play the file via a GUI, like the pgAdminIII queries tool.

## Usage

Examples are based on Express 4.

Simple example:

```javascript
var session = require('express-session');

app.use(session({
  store: new (require('connect-pg-simple')(session))(),
  secret: process.env.FOO_COOKIE_SECRET,
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));
```

Advanced example showing some custom options:

```javascript
var pg = require('pg')
  , session = require('express-session')
  , pgSession = require('connect-pg-simple')(session);

var pgPool = new pg.Pool({
    // Insert pool options here
});

app.use(session({
  store: new pgSession({
    pool : pgPool,                // Connection pool
    tableName : 'user_sessions'   // Use another table-name than the default "session" one
  }),
  secret: process.env.FOO_COOKIE_SECRET,
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));
```

Express 3 (and similar for Connect):

```javascript
var express = require('express');

app.use(session({
  store: new (require('connect-pg-simple')(express.session))(),
  secret: process.env.FOO_COOKIE_SECRET,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));
```

## Advanced options

* **pool** - Recommended. Connection pool object (compatible with [pg.Pool](https://github.com/brianc/node-pg-pool)) for the underlying database module. The **conString** option is ignored if this option is specified.
* **pgPromise** - Existing instance of `pg-promise` to be used for DB communications. The **conString** option is ignored if this option is specified.
* **conString** - If you don't specify a pool object, use this option or `conObject` to specify a PostgreSQL connection [string](https://github.com/brianc/node-postgres/wiki/Client#new-clientstring-url-client) and this module will create a new pool for you. If the connection string is in the `DATABASE_URL` environment variable (as you do by default on eg. Heroku) – then this module fallback to that if this option is not specified.
* **conObject** - If you don't specify a pool object, use this option or `conString` to specify a PostgreSQL Pool connection [object](https://github.com/brianc/node-postgres#pooling-example) and this module will create a new pool for you.
* **ttl** - the time to live for the session in the database – specified in seconds. Defaults to the cookie maxAge if the cookie has a maxAge defined and otherwise defaults to one day.
* **schemaName** - if your session table is in another Postgres schema than the default (it normally isn't), then you can specify that here.
* **tableName** - if your session table is named something else than `session`, then you can specify that here.
* **pruneSessionInterval** - sets the delay in seconds at which expired sessions are pruned from the database. Default is `60` seconds. If set to `false` no automatic pruning will happen. Automatic pruning weill happen `pruneSessionInterval` seconds after the last pruning – manual or automatic.
* **errorLog** – the method used to log errors in those cases where an error can't be returned to a callback. Defaults to `console.error()`, but can be useful to override if one eg. uses [Bunyan](https://github.com/trentm/node-bunyan) for logging.

## Useful methods

* **close()** – if this module used its own database module to connect to Postgres, then this will shut that connection down to allow a graceful shutdown.
* **pruneSessions([callback(err)])** – will prune old sessions. Only really needed to be called if **pruneSessionInterval** has been set to `false` – which can be useful if one wants improved control of the pruning.
