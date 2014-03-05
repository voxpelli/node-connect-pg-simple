# Connect PG Simple

A simple, minimal PostgreSQL session store for Connect/Express

## Usage

Simple:

```javascript
var pgSession = require('./utils/pg-session')(express);
app.use(express.session({
  store: new pgSession(),
  secret: process.env.FOO_COOKIE_SECRET,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));
```

Advanced:

```javascript
var pg = require('pg')
  , pgSession = require('./utils/pg-session')(express);

app.use(express.session({
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
* **conString** - if you don't have your PostgreSQL connection string in the DATABASE_URL environment variable (as you do by default on eg. Heroku) – then you need to send the connection string here as this module uses its own connection.

## Changelog

### 1.0.0

* First NPM-version of the script originally published as a Gist here: https://gist.github.com/voxpelli/6447728
