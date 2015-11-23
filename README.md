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

## Changelog

### 3.1.0

* Feature: Support the `store.touch()` method to allow for extending the life time of a session without changing the data of it. This enables setting the `resave` option to `false`, which is recommended to avoid a session extender save overwriting another save that adds new data to the session. More info in the [express-session readme](https://github.com/expressjs/session#resave).
* Fix: Relax the engine requirements – accept newer versions of Node.js/iojs as well

### 3.0.2

* Fix: Added support for [sails](http://sailsjs.org/) by supporting sending the full Express 3 object into the plugin

### 3.0.1

* Fix: If the `pg` instance used is created by this module, then this module should also close it on `close()`

### 3.0.0

* Improvement: Rather than randomly cleaning up expired sessions that will now happen at the `options.pruneSessionInterval` defined interval.
* Breaking change: Clients now need to close the session store to gracefully shut down their app as the pruning of sessions can't know when the rest of the app has stopped running and thus can't know when to stop pruning sessions if it itsn't told so explicitly through thew new `close()` method – or by deactivating the automatic pruning by settinging `options.pruneSessionInterval` to `false`. If automatic pruning is disabled the client needs to call `pruneSessions()` manually or otherwise ensure that old sessions are pruned.

### 2.3.0

* Fix regression: No longer default to `public` schema, as added in `2.2.0`, but rather default to the pre-`2.2.0` behavior of no defined schema. This to ensure backwards compatibility with the `2.x` branch, per semantic versioning best practise.

### 2.2.1

* Hotfix: Update `require('pg')` to match package.json, thanks for reporting @dmitriiabramov

### 2.2.0

* New: Now possibly to set another schema than the default
* Change: Now using the `pg` dependency again rather than `pg.js` as the latter will be discontinued as `pg` now fills its role

### 2.1.1

* Fix bug with creating new sessions that was caused by 2.1.0

### 2.1.0

* Enable the table name to be configured through new `tableName` option

### 2.0.0

* Backwards incompatible change: Support for Express 4 means that Express 3 apps (and similar for Connect apps) should send `express.session` to the module rather than just `express`.
* Dependency change: The database module is now [pg.js](https://www.npmjs.org/package/pg.js) rather than [pg](https://www.npmjs.org/package/pg) – same library, but without compilation of any native bindings and thus less delay when eg. installing the application from scratch.

### 1.0.2

* Support for PostgreSQL versions older than 9.2

### 1.0.1

* Fix for sometimes not expiring sessions correctly

### 1.0.0

* First NPM-version of the script originally published as a Gist here: https://gist.github.com/voxpelli/6447728
