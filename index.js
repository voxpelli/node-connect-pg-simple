/*jslint node: true */

'use strict';

var util = require('util');
var oneDay = 86400;

var currentTimestamp = function () {
  return Math.ceil(Date.now() / 1000);
};

module.exports = function (session) {

  var Store = session.Store || session.session.Store,
    PGStore;

  PGStore = function (options) {
    options = options || {};
    Store.call(this, options);

    this.schemaName = options.schemaName || null;
    this.tableName = options.tableName || 'session';

    this.conString = options.conString || process.env.DATABASE_URL;
    this.ttl =  options.ttl;
    this.pg = options.pg || require('pg');
    this.ownsPg = !options.pg;

    this.errorLog = options.errorLog || console.error.bind(console);

    if (options.pruneSessionInterval === false) {
      this.pruneSessionInterval = false;
    } else {
      this.pruneSessionInterval = (options.pruneSessionInterval || 60) * 1000;
      setImmediate(function () {
        this.pruneSessions();
      }.bind(this));
    }
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
      this.pg.end();
    }
  };

  /**
   * Does garbage collection for expired session in the database
   *
   * @param {Function} [fn] - standard Node.js callback called on completion
   * @access public
   */

  PGStore.prototype.pruneSessions = function (fn) {
    this.query('DELETE FROM ' + this.quotedTable() + ' WHERE expire < to_timestamp($1)', [currentTimestamp()], function (err) {
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
      }
    }.bind(this));
  };

  /**
   * Get the quoted table.
   *
   * @return {String} the quoted schema + table for use in queries
   * @access private
   */

  PGStore.prototype.quotedTable = function () {
    var result = '"' + this.tableName + '"';

    if (this.schemaName) {
      result = '"' + this.schemaName + '".' + result;
    }

    return result;
  };

  /**
   * Figure out when a session should expire
   *
   * @param {Number} [maxAge] - the maximum age of the session cookie
   * @return {Number} the unix timestamp, in seconds
   * @access private
   */

  PGStore.prototype.getExpireTime = function (maxAge) {
    var ttl = this.ttl;

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
    this.pg.connect(this.conString, function (err, client, done) {
      if (err) {
        done(client);
        if (fn) { fn(err); }
      } else {
        client.query(query, params || [], function (err, result) {
          done(err || false);
          if (fn) { fn(err, result && result.rows[0] ? result.rows[0] : false); }
        });
      }
    });
  };

  /**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid – the session id
   * @param {Function} fn – a standard Node.js callback returning the parsed session object
   * @access public
   */

  PGStore.prototype.get = function (sid, fn) {
    this.query('SELECT sess FROM ' + this.quotedTable() + ' WHERE sid = $1 AND expire >= to_timestamp($2)', [sid, currentTimestamp()], function (err, data) {
      if (err) { return fn(err); }
      if (!data) { return fn(); }
      try {
        return fn(null, ('string' === typeof data.sess) ? JSON.parse(data.sess) : data.sess);
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
    var self = this;
    var expireTime = this.getExpireTime(sess.cookie.maxAge);
    var query = 'UPDATE ' + this.quotedTable() + ' SET sess = $1, expire = to_timestamp($2) WHERE sid = $3 RETURNING sid';

    this.query(query, [sess, expireTime, sid], function (err, data) {
      if (!err && data === false) {
        query = 'INSERT INTO ' + self.quotedTable() + ' (sess, expire, sid) SELECT $1, to_timestamp($2), $3 WHERE NOT EXISTS (SELECT 1 FROM ' + self.quotedTable() + ' WHERE sid = $4)';

        self.query(query, [sess, expireTime, sid, sid], function (err) {
          if (fn) { fn.apply(this, err); }
        });
      } else {
        if (fn) { fn.apply(this, err); }
      }
    });
  };

  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid – the session id
   * @access public
   */

  PGStore.prototype.destroy = function (sid, fn) {
    this.query('DELETE FROM ' + this.quotedTable() + ' WHERE sid = $1', [sid], function (err) {
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
    var expireTime = this.getExpireTime(sess.cookie.maxAge);

    this.query(
      'UPDATE ' + this.quotedTable() + ' SET expire = to_timestamp($1) WHERE sid = $2 RETURNING sid',
      [expireTime, sid],
      function (err) { fn(err); }
    );
  };

  return PGStore;
};
