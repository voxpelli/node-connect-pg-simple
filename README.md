# Connect PG Simple

A simple, minimal PostgreSQL session store for Express/Connect

[![npm version](https://img.shields.io/npm/v/connect-pg-simple.svg?style=flat)](https://www.npmjs.com/package/connect-pg-simple)
[![npm downloads](https://img.shields.io/npm/dm/connect-pg-simple.svg?style=flat)](https://www.npmjs.com/package/connect-pg-simple)
[![Module type: CJS](https://img.shields.io/badge/module%20type-cjs-brightgreen)](https://github.com/voxpelli/badges-cjs-esm)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-7fffff?style=flat&labelColor=ff80ff)](https://github.com/neostandard/neostandard)
[![Follow @voxpelli@mastodon.social](https://img.shields.io/mastodon/follow/109247025527949675?domain=https%3A%2F%2Fmastodon.social&style=social)](https://mastodon.social/@voxpelli)

## Installation

```bash
npm install connect-pg-simple
```

**Once npm installed the module, you need to create the _"session"_ table in your database.**

For that you can use the [table.sql](table.sql) file provided with the module:

```bash
psql mydatabase < node_modules/connect-pg-simple/table.sql
```

Or simply play the file via a GUI, like the pgAdminIII queries tool.

Or instruct this module to create it itself, by setting the `createTableIfMissing` option.

Note that `connect-pg-simple` requires PostgreSQL version 9.5 or above.

## Usage

Examples are based on Express 4.

Simple example:

```javascript
const session = require('express-session');

app.use(session({
  store: new (require('connect-pg-simple')(session))({
    // Insert connect-pg-simple options here
  }),
  secret: process.env.FOO_COOKIE_SECRET,
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
  // Insert express-session options here
}));
```

Advanced example showing some custom options:

```javascript
const pg = require('pg');
const expressSession = require('express-session');
const pgSession = require('connect-pg-simple')(expressSession);

const pgPool = new pg.Pool({
    // Insert pool options here
});

app.use(expressSession({
  store: new pgSession({
    pool : pgPool,                // Connection pool
    tableName : 'user_sessions'   // Use another table-name than the default "session" one
    // Insert connect-pg-simple options here
  }),
  secret: process.env.FOO_COOKIE_SECRET,
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
  // Insert express-session options here
}));
```

## Advanced options


### Connection options

Listed in the order they will be picked up. If multiple are defined, then the first in the lists that is defined will be used, the rest ignored.

* **pool** - _The recommended one_ – Connection pool object (compatible with [pg.Pool](https://github.com/brianc/node-pg-pool)) for the underlying database module.
* **pgPromise** - Database object from `pg-promise` to be used for DB communications.
* **conObject** - If you don't specify a pool object, use this option or `conString` to specify a [PostgreSQL Pool connection object](https://node-postgres.com/api/client#constructor) and this module will create a new pool for you.
* **conString** - If you don't specify a pool object, use this option or `conObject` to specify a PostgreSQL connection string like `postgres://user:password@host:5432/database` and this module will create a new pool for you. If there's a connection string in the `DATABASE_URL` environment variable (as it is by default on eg. Heroku) then this module will fallback to that if no other connection method has been specified.

### Other options

* **ttl** - the time to live for the session in the database – specified in seconds. Defaults to the cookie maxAge if the cookie has a maxAge defined and otherwise defaults to one day.
* **createTableIfMissing** - if set to `true` then creates the table in the case where the table does not already exist. Defaults to `false`.
* **disableTouch** – boolean value that if set to `true` disables the updating of TTL in the database when using touch. Defaults to false.
* **schemaName** - if your session table is in another Postgres schema than the default (it normally isn't), then you can specify that here.
* **tableName** - if your session table is named something else than `session`, then you can specify that here.
* **pruneSessionInterval** - sets the delay in seconds at which expired sessions are pruned from the database. Default is `900` seconds (15 minutes). If set to `false` no automatic pruning will happen. By default every delay is randomized between 50% and 150% of set value, resulting in an average delay equal to the set value, but spread out to even the load on the database. Automatic pruning will happen `pruneSessionInterval` seconds after the last pruning (includes manual prunes).
* **pruneSessionRandomizedInterval** – if set to `false`, then the exact value of `pruneSessionInterval` will be used in all delays. No randomization will happen. If multiple instances all start at once, disabling randomization can mean that multiple instances are all triggering pruning at once, causing unnecessary load on the database. Can also be set to a method, taking a numeric `delay` parameter and returning a modified one, thus allowing a custom delay algorithm if wanted.
* **errorLog** – the method used to log errors in those cases where an error can't be returned to a callback. Defaults to `console.error()`, but can be useful to override if one eg. uses [Bunyan](https://github.com/trentm/node-bunyan) for logging.

## Useful methods

* **close()** – if this module used its own database module to connect to Postgres, then this will shut that connection down to allow a graceful shutdown. Returns a `Promise` that will resolve when the database has shut down.
* **pruneSessions([callback(err)])** – will prune old sessions. Only really needed to be called if **pruneSessionInterval** has been set to `false` – which can be useful if one wants improved control of the pruning.

## For enterprise

Available as part of the Tidelift Subscription.

The maintainers of connect-pg-simple and thousands of other packages are working with Tidelift to deliver commercial support and maintenance for the open source packages you use to build your applications. Save time, reduce risk, and improve code health, while paying the maintainers of the exact packages you use. [Learn more.](https://tidelift.com/subscription/pkg/npm-connect-pg-simple?utm_source=npm-connect-pg-simple&utm_medium=referral&utm_campaign=enterprise&utm_term=repo)
