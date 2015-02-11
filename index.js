var oneDay = 86400;

module.exports = function (session) {

  var Store = session.Store
    , PGStore
    , lastExpiryCheck = 0;

  PGStore = function (options) {
    options = options || {};
    Store.call(this, options);

    this.schemaName = options.schemaName || 'public';
    this.tableName = options.tableName || 'session';

    this.conString = options.conString || process.env.DATABASE_URL;
    this.ttl =  options.ttl;
    this.pg = options.pg || require('pg');

    this.expiryMethod = options.expiryMethod || "random";
    this.randomExpiryFactor = options.randomExpiryFactor || 0.5;
    this.timedExpiryDelay = options.timedExpiryDelay || 60;
  };

  /**
   * Inherit from `Store`.
   */

  PGStore.prototype.__proto__ = Store.prototype;

  /**
   * Get the quoted table.
   *
   * @return {String} the quoted schema + table for use in queries
   * @access private
   */

  PGStore.prototype.quotedTable = function () {
    return '"' + this.schemaName + '"."' + this.tableName + '"';
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
    }
    this.pg.connect(this.conString, function (err, client, done) {
      if (err) {
        done(client);
        fn && fn(err);
      } else {
        client.query(query, params || [], function (err, result) {
          done(err || false);
          fn && fn(err, result && result.rows[0] ? result.rows[0] : false);
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
    var doExpiryCheck = false
      , now = null;

    if (this.expiryMethod === "timed" ){
      // for timed check, we only do the request based on a delay of the last check
      doExpiryCheck = Date.now() >= lastExpiryCheck + this.timedExpiryDelay * 1000;
    }else {
      // Random check is based on request frequency and randomExpiryFactor (more requests and/or high factor means more checks)
      doExpiryCheck = Math.random() <= this.randomExpiryFactor;
    }

    if (doExpiryCheck){
      lastExpiryCheck = Date.now();
      this.query('DELETE FROM ' + this.quotedTable() + ' WHERE expire < NOW()');
    }

    this.query('SELECT sess FROM ' + this.quotedTable() + ' WHERE sid = $1 AND expire >= NOW()', [sid], function (err, data) {
      if (err) return fn(err);
      if (!data) return fn();
      try {
        return fn(null, ('string' === typeof data.sess) ? JSON.parse(data.sess) : data.sess);
      } catch(e) {
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
    var self = this
      , maxAge = sess.cookie.maxAge
      , ttl = this.ttl;

    ttl = ttl || ('number' == typeof maxAge
      ? maxAge / 1000 | 0
      : oneDay);
    ttl += Date.now() / 1000;

    this.query('UPDATE ' + this.quotedTable() + ' SET sess = $1, expire = to_timestamp($2) WHERE sid = $3 RETURNING sid', [sess, ttl, sid], function (err, data) {
      if (!err && data === false) {
        self.query('INSERT INTO ' + self.quotedTable() + ' (sess, expire, sid) SELECT $1, to_timestamp($2), $3 WHERE NOT EXISTS (SELECT 1 FROM ' + self.quotedTable() + ' WHERE sid = $4)', [sess, ttl, sid, sid], function (err) {
          fn && fn.apply(this, err);
        });
      } else {
        fn && fn.apply(this, err);
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
      fn && fn(err);
    });
  };

  return PGStore;
};
