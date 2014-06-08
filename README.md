# Connect PG Simple

A simple, minimal PostgreSQL session store for Express/Connect

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

Simple:

```javascript
var session = require('express-session');

app.use(session({
  store: new (require('connect-pg-simple')(session))(),
  secret: process.env.FOO_COOKIE_SECRET,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));
```

Advanced:

```javascript
var pg = require('pg')
  , session = require('express-session')
  , pgSession = require('connect-pg-simple')(session);

app.use(session({
  store: new pgSession({
    pg : pg,
    conString : process.env.FOO_DATABASE_URL
  }),
  secret: process.env.FOO_COOKIE_SECRET,
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

## Changelog

### 2.0.0

* Backwards incompatible change: Support for Express 4 means that Express 3 apps (and similar for Connect apps) should send `express.session` to the module rather than just `express`.
* Dependency change: The database module is now [pg.js](https://www.npmjs.org/package/pg.js) rather than [pg](https://www.npmjs.org/package/pg) – same library, but without compilation of any native bindings and thus less delay when eg. installing the application from scratch.

### 1.0.2

* Support for PostgreSQL versions older than 9.2

### 1.0.1

* Fix for sometimes not expiring sessions correctly

### 1.0.0

* First NPM-version of the script originally published as a Gist here: https://gist.github.com/voxpelli/6447728
