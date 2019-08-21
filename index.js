'use strict';

const util = require('util');
const oneDay = 86400;
const pgVersionMin = { major: 9, minor: 5 };

const currentTimestamp = function () {
  return Math.ceil(Date.now() / 1000);
};

// Define all queries to the databse here.  The $TABLE will be
// replaced during initialization, with a propperly quoted value.
const SQL = Object.freeze({
  setup:
    'SELECT version(), quote_ident($1) AS schema, quote_ident($2) AS table',
  set:
    'INSERT INTO $TABLE (sess, expire, sid) ' +
    'SELECT $1, to_timestamp($2), $3 ' +
    'ON CONFLICT (sid) DO ' + // Needs Postgrsql 9.5 or later for ON CONFLICT DO
    'UPDATE SET sess=$1, expire=to_timestamp($2) ' +
    'RETURNING sid',
  prune:
    'DELETE FROM $TABLE WHERE expire < to_timestamp($1)',
  touch:
    'UPDATE $TABLE SET expire = to_timestamp($1) ' +
    'WHERE sid = $2 RETURNING sid',
  destroy:
    'DELETE FROM $TABLE WHERE sid = $1',
  get:
    'SELECT sess FROM $TABLE WHERE sid = $1 AND expire >= to_timestamp($2)'
});

module.exports = function (session) {
  const Store = session.Store || session.session.Store;

  const PGStore = function (options) {
    options = options || {};
    Store.call(this, options);

    this.schemaName = options.schemaName || null;
    this.tableName = options.tableName || 'session';

    this.ttl = options.ttl;

    this.errorLog = options.errorLog || console.error.bind(console);

    if (options.pool !== undefined) {
      this.pool = options.pool;
      this.ownsPg = false;
    } else if (options.pgPromise !== undefined) {
      if (typeof options.pgPromise.query !== 'function') {
        throw new Error('`pgPromise` config must point to an existing and configured instance of pg-promise pointing at your database');
      }
      this.pgPromise = options.pgPromise;
      this.ownsPg = false;
    } else {
      const conString = options.conString || process.env.DATABASE_URL;
      let conObject = options.conObject;

      if (!conObject) {
        conObject = {};

        if (conString) {
          conObject.connectionString = conString;
        }
      }

      this.pool = new (require('pg')).Pool(conObject);
      this.pool.on('error', err => {
        this.errorLog('PG Pool error:', err.message);
      });
      this.ownsPg = true;
    }

    // Calling quote_ident on schemaName and tableName will propperly
    // quote them if needed. Embedded quotes are properly doubled.

    this.query(SQL.setup, [this.schemaName, this.tableName], (err, res) => {
      if (err) return this.errorLog(err);
      // Extract major and minor version from string
      let ver = /\s(\d+)\.(\d+)/.exec(res.version);
      if (!ver) {
        this.errorLog(Error('Could not get server version'));
      } else {
        const min = pgVersionMin;
        ver = {
          major: parseInt(ver[1]),
          minor: parseInt(ver[2])
        };
        if (ver.major < min.major || (ver.major === min.major && ver.minor < min.minor)) {
          this.errorLog(Error(
            `Too old version of postgresql. Need ${min.major}.${min.minor} or later.`
          ));
        }
      }

      // Concatenate schema and table name.
      const fqname = (res.schema ? res.schema + '.' : '') + res.table;
      // Replace $TABLE in query strings with the correct value.
      this.SQL = Object.keys(SQL).reduce(function (out, key) {
        out[key] = SQL[key].replace(/\$TABLE/g, fqname);
        return out;
      }, {});
      this.SQL = Object.freeze(this.SQL);

      if (options.pruneSessionInterval === false) {
        this.pruneSessionInterval = false;
      } else {
        this.pruneSessionInterval = (options.pruneSessionInterval || 60) * 1000;
        setImmediate(function () {
          this.pruneSessions();
        }.bind(this));
      }
    });
  };

  /**
   * Inherit from `Store`.
   */

  util.inherits(PGStore, Store);

  /**
   * Closes the session store
   *
   * Currently only stops the automatic pruning, if any, from continuing
   *
   * @access public
   */

  PGStore.prototype.close = function () {
    this.closed = true;

    if (this.pruneTimer) {
      clearTimeout(this.pruneTimer);
      this.pruneTimer = undefined;
    }

    if (this.ownsPg) {
      this.pool.end();
    }
  };

  /**
   * Does garbage collection for expired session in the database
   *
   * @param {Function} [fn] - standard Node.js callback called on completion
   * @access public
   */

  PGStore.prototype.pruneSessions = function (fn) {
    this.query(this.SQL.prune, [currentTimestamp()], function (err) {
      if (fn && typeof fn === 'function') {
        return fn(err);
      }

      if (err) {
        this.errorLog('Failed to prune sessions:', err.message);
      }

      if (this.pruneSessionInterval && !this.closed) {
        if (this.pruneTimer) {
          clearTimeout(this.pruneTimer);
        }
        this.pruneTimer = setTimeout(this.pruneSessions.bind(this, true), this.pruneSessionInterval);
        this.pruneTimer.unref();
      }
    }.bind(this));
  };

  /**
   * Figure out when a session should expire
   *
   * @param {Number} [maxAge] - the maximum age of the session cookie
   * @return {Number} the unix timestamp, in seconds
   * @access private
   */

  PGStore.prototype.getExpireTime = function (maxAge) {
    let ttl = this.ttl;

    ttl = ttl || (typeof maxAge === 'number' ? maxAge / 1000 : oneDay);
    ttl = Math.ceil(ttl + currentTimestamp());

    return ttl;
  };

  /**
   * Query the database.
   *
   * @param {String} query - the database query to perform
   * @param {(Array|Function)} [params] - the parameters of the query or the callback function
   * @param {Function} [fn] - standard Node.js callback returning the resulting rows
   * @access private
   */

  PGStore.prototype.query = function (query, params, fn) {
    if (!fn && typeof params === 'function') {
      fn = params;
      params = [];
    }

    if (this.pgPromise) {
      this.pgPromise.query(query, params || [])
        .then(function (res) { fn && fn(null, res && res[0] ? res[0] : false); })
        .catch(function (err) { fn && fn(err, false); });
    } else {
      this.pool.query(query, params || [], function (err, res) {
        if (fn) { fn(err, res && res.rows[0] ? res.rows[0] : false); }
      });
    }
  };

  /**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid – the session id
   * @param {Function} fn – a standard Node.js callback returning the parsed session object
   * @access public
   */

  PGStore.prototype.get = function (sid, fn) {
    this.query(this.SQL.get, [sid, currentTimestamp()], function (err, data) {
      if (err) { return fn(err); }
      if (!data) { return fn(); }
      try {
        return fn(null, (typeof data.sess === 'string') ? JSON.parse(data.sess) : data.sess);
      } catch (e) {
        return this.destroy(sid, fn);
      }
    }.bind(this));
  };

  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid – the session id
   * @param {Object} sess – the session object to store
   * @param {Function} fn – a standard Node.js callback returning the parsed session object
   * @access public
   */

  PGStore.prototype.set = function (sid, sess, fn) {
    const expireTime = this.getExpireTime(sess.cookie.maxAge);
    this.query(this.SQL.set, [sess, expireTime, sid], function (err) {
      if (fn) { fn.call(this, err); }
    });
  };

  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid – the session id
   * @access public
   */

  PGStore.prototype.destroy = function (sid, fn) {
    this.query(this.SQL.destroy, [sid], function (err) {
      if (fn) { fn(err); }
    });
  };

  /**
   * Touch the given session object associated with the given session ID.
   *
   * @param {String} sid – the session id
   * @param {Object} sess – the session object to store
   * @param {Function} fn – a standard Node.js callback returning the parsed session object
   * @access public
   */

  PGStore.prototype.touch = function (sid, sess, fn) {
    const expireTime = this.getExpireTime(sess.cookie.maxAge);
    this.query(this.SQL.touch, [expireTime, sid], function (err) { fn(err); });
  };

  return PGStore;
};
