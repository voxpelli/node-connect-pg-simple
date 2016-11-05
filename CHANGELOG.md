# Changelog

## 3.1.2

* Bug fix: Previous timestamp fix failed critically, fixing it again. Thanks @G3z and @eemeli

## 3.1.1

* Bug fix: The internal query helper was treating params() wrong when called with two argument. Thanks for reporting @colideum!
* Bug fix: If the database and the node instances had different clocks, then things wouldn't work that well due to mixed timestamp sources. Now node handles all timestamps. Thanks for reporting @sverkoye!

## 3.1.0

* Feature: Support the `store.touch()` method to allow for extending the life time of a session without changing the data of it. This enables setting the `resave` option to `false`, which is recommended to avoid a session extender save overwriting another save that adds new data to the session. More info in the [express-session readme](https://github.com/expressjs/session#resave).
* Fix: Relax the engine requirements – accept newer versions of Node.js/iojs as well

## 3.0.2

* Fix: Added support for [sails](http://sailsjs.org/) by supporting sending the full Express 3 object into the plugin

## 3.0.1

* Fix: If the `pg` instance used is created by this module, then this module should also close it on `close()`

## 3.0.0

* Improvement: Rather than randomly cleaning up expired sessions that will now happen at the `options.pruneSessionInterval` defined interval.
* Breaking change: Clients now need to close the session store to gracefully shut down their app as the pruning of sessions can't know when the rest of the app has stopped running and thus can't know when to stop pruning sessions if it itsn't told so explicitly through thew new `close()` method – or by deactivating the automatic pruning by settinging `options.pruneSessionInterval` to `false`. If automatic pruning is disabled the client needs to call `pruneSessions()` manually or otherwise ensure that old sessions are pruned.

## 2.3.0

* Fix regression: No longer default to `public` schema, as added in `2.2.0`, but rather default to the pre-`2.2.0` behavior of no defined schema. This to ensure backwards compatibility with the `2.x` branch, per semantic versioning best practise.

## 2.2.1

* Hotfix: Update `require('pg')` to match package.json, thanks for reporting @dmitriiabramov

## 2.2.0

* New: Now possibly to set another schema than the default
* Change: Now using the `pg` dependency again rather than `pg.js` as the latter will be discontinued as `pg` now fills its role

## 2.1.1

* Fix bug with creating new sessions that was caused by 2.1.0

## 2.1.0

* Enable the table name to be configured through new `tableName` option

## 2.0.0

* Backwards incompatible change: Support for Express 4 means that Express 3 apps (and similar for Connect apps) should send `express.session` to the module rather than just `express`.
* Dependency change: The database module is now [pg.js](https://www.npmjs.org/package/pg.js) rather than [pg](https://www.npmjs.org/package/pg) – same library, but without compilation of any native bindings and thus less delay when eg. installing the application from scratch.

## 1.0.2

* Support for PostgreSQL versions older than 9.2

## 1.0.1

* Fix for sometimes not expiring sessions correctly

## 1.0.0

* First NPM-version of the script originally published as a Gist here: https://gist.github.com/voxpelli/6447728
