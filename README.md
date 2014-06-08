# Connect PG Simple

A simple, minimal PostgreSQL session store for Connect/Express

## Installation

```bash
npm install connect-pg-simple
```

Once npm installed the module, you need to create the **session** table in your database. For that you can use the [table.sql] (https://github.com/voxpelli/node-connect-pg-simple/blob/master/table.sql) file provided with the module: 

```bash
psql mydatabase < node_modules/connect-pg-simple/table.sql
```

Or simply play the file via the pgAdminIII queries tool.

## Usage

Simple:

```javascript
var session = require('express-session')
  , pgSession = require('connect-pg-simple')(session);

app.use(session({
  store: new pgSession(),
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
    pg : pg
  }),
  secret: process.env.FOO_COOKIE_SECRET,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));
```

## Advanced options

* **pg** - if you want the session store to use the same database module as the rest of your app, send it in here.
* **ttl** - the time to live for the session in the database – specified in seconds. Defaults to the cookie maxAge if the cookie has a maxAge defined and otherwise defaults to one day.
* **conString** - if you don't have your PostgreSQL connection string in the DATABASE_URL environment variable (as you do by default on eg. Heroku) – then you need to send the connection [string or object](https://github.com/brianc/node-postgres/wiki/pg#connectstring-connectionstring-function-callback) here as this module uses its own connection.

## Changelog

### 1.0.2

* Support for PostgreSQL versions older than 9.2

### 1.0.1

* Fix for sometimes not expiring sessions correctly

### 1.0.0

* First NPM-version of the script originally published as a Gist here: https://gist.github.com/voxpelli/6447728
