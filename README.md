# Connect PG Simple

A simple, minimal PostgreSQL session store for Express/Connect

[![Build Status](https://travis-ci.org/voxpelli/node-connect-pg-simple.svg?branch=master)](https://travis-ci.org/voxpelli/node-connect-pg-simple)
[![Coverage Status](https://img.shields.io/coveralls/voxpelli/node-connect-pg-simple.svg)](https://coveralls.io/r/voxpelli/node-connect-pg-simple)
[![Dependency Status](https://gemnasium.com/voxpelli/node-connect-pg-simple.svg)](https://gemnasium.com/voxpelli/node-connect-pg-simple)

## Installation

```bash
npm install connect-pg-simple
```

Once npm installed the module, you need to create the **session** table in your database. For that you can use the [table.sql] (https://github.com/voxpelli/node-connect-pg-simple/blob/master/table.sql) file provided with the module: 

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

app.use(session({
  store: new pgSession({
    pg : pg,                                  // Use global pg-module
    conString : process.env.FOO_DATABASE_URL, // Connect using something else than default DATABASE_URL env variable
    tableName : 'user_sessions'               // Use another table-name than the default "session" one
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

* **pg** - Recommended. If you want the session store to use the same database module (compatible with [pg](https://www.npmjs.org/package/pg) / [pg.js](https://www.npmjs.org/package/pg.js)) as the rest of your app, then send it in here. Useful as eg. the connection pool then can be shared between the module and the rest of the application. Also useful if you want this module to use the native bindings of [pg](https://www.npmjs.org/package/pg) as this module itself only comes with [pg.js](https://www.npmjs.org/package/pg.js).
* **ttl** - the time to live for the session in the database – specified in seconds. Defaults to the cookie maxAge if the cookie has a maxAge defined and otherwise defaults to one day.
* **conString** - if you don't have your PostgreSQL connection string in the `DATABASE_URL` environment variable (as you do by default on eg. Heroku) – then you need to specify the connection [string or object](https://github.com/brianc/node-postgres/wiki/pg#connectstring-connectionstring-function-callback) here so that this module that create new connections. Needen even if you supply your own database module.
* **schemaName** - if your session table is in another Postgres schema than the default (it normally isn't), then you can specify that here.
* **tableName** - if your session table is named something else than `session`, then you can specify that here.
* **pruneSessionInterval** - sets the delay in seconds at which expired sessions are pruned from the database. Default is `60` seconds. If set to `false` no automatic pruning will happen. Automatic pruning weill happen `pruneSessionInterval` seconds after the last pruning – manual or automatic.
* **errorLog** – the method used to log errors in those cases where an error can't be returned to a callback. Defaults to `console.error()`, but can be useful to override if one eg. uses [Bunyan](https://github.com/trentm/node-bunyan) for logging.

## Useful methods

* **close()** – if automatic interval pruning is on, which it is by default as of `3.0.0`, then the timers will block any graceful shutdown unless you tell the automatic pruning to stop by closing the session handler using this method.
* **pruneSessions([callback(err)])** – will prune old sessions. Only really needed to be called if **pruneSessionInterval** has been set to `false` – which can be useful if one wants improved control of the pruning.
