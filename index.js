var oneDay = 86400;

module.exports = function (session) {

  var Store = session.Store
    , PGStore;

  PGStore = function (options) {
    var self = this;

    options = options || {};
    Store.call(this, options);

    this.conString = options.conString || process.env.DATABASE_URL;
    this.ttl =  options.ttl;
    this.pg = options.pg || require('pg.js');
  };

  /**
   * Inherit from `Store`.
   */

  PGStore.prototype.__proto__ = Store.prototype;

  /**
   * Query the database.
   *
   * @param {String} query
   * @param {Array} params
   * @param {Function} fn
   * @api public
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
   * @param {String} sid
   * @param {Function} fn
   * @api public
   */

  PGStore.prototype.get = function (sid, fn) {
    // Clean up occasionly – but not always...
    if (Math.random() < 0.05) {
      this.query('DELETE FROM session WHERE expire < NOW()');
    }
    this.query('SELECT sess FROM session WHERE sid = $1 AND expire >= NOW()', [sid], function (err, data) {
      if (err) return fn(err);
      if (!data) return fn();
      try {
        return fn(null, ("string" == typeof data.sess) ? JSON.parse(data.sess) : data.sess);
      } catch(e) {
        return this.destroy(sid, fn);
      }
    }.bind(this));
  };

  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} fn
   * @api public
   */

  PGStore.prototype.set = function (sid, sess, fn) {
    var self = this
      , maxAge = sess.cookie.maxAge
      , ttl = this.ttl;

    ttl = ttl || ('number' == typeof maxAge
        ? maxAge / 1000 | 0
        : oneDay);
    ttl += Date.now() / 1000;

    this.query("UPDATE session SET sess = $1, expire = to_timestamp($2) WHERE sid = $3 RETURNING sid", [sess, ttl, sid], function (err, data) {
      if (!err && data === false) {
        self.query("INSERT INTO session (sess, expire, sid) SELECT $1, to_timestamp($2), $3 WHERE NOT EXISTS (SELECT 1 FROM session WHERE sid = $4)", [sess, ttl, sid, sid], function (err) {
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
   * @param {String} sid
   * @api public
   */

  PGStore.prototype.destroy = function (sid, fn) {
    this.query("DELETE FROM session WHERE sid = $1", [sid], function (err) {
      fn && fn(err);
    });
  };

  return PGStore;
};
