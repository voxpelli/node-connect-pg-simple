// @ts-check
/// <reference types="node" />

'use strict';

const DEFAULT_PRUNE_INTERVAL_IN_SECONDS = 60 * 15;
const ONE_DAY = 86400;

/** @typedef {*} ExpressSession */
/** @typedef {*} ExpressSessionStore */
/** @typedef {import('pg').Pool} Pool */

/** @returns {number} */
const currentTimestamp = () => Math.ceil(Date.now() / 1000);

/**
 * @see https://www.postgresql.org/docs/9.5/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS
 * @param {string} value
 * @returns {string}
 */
const escapePgIdentifier = (value) => value.replace(/"/g, '""');

/** @typedef {(err: Error|null) => void} SimpleErrorCallback */

/** @typedef {{ cookie: { maxAge: number, [property: string]: any }, [property: string]: any }} SessionObject */

/** @typedef {(delay: number) => number} PGStorePruneDelayRandomizer */
/** @typedef {Object<string, any>} PGStoreQueryResult */
/** @typedef {(err: Error|null, firstRow?: PGStoreQueryResult) => void} PGStoreQueryCallback */

/**
 * @typedef PGStoreOptions
 * @property {string} [schemaName]
 * @property {string} [tableName]
 * @property {number} [ttl]
 * @property {typeof console.error} [errorLog]
 * @property {Pool} [pool]
 * @property {*} [pgPromise]
 * @property {string} [conString]
 * @property {*} [conObject]
 * @property {false|number} [pruneSessionInterval]
 * @property {false|PGStorePruneDelayRandomizer} [pruneSessionRandomizedInterval]
 */

/**
 * @param {ExpressSession} session
 * @returns {ExpressSessionStore}
 */
module.exports = function (session) {
  /** @type {ExpressSessionStore} */
  const Store = session.Store ||
    // @ts-ignore
    session.session.Store;

  class PGStore extends Store {
    /** @param {PGStoreOptions} options */
    constructor (options = {}) {
      super(options);

      this.schemaName = options.schemaName ? escapePgIdentifier(options.schemaName) : undefined;
      /** @type {string} */
      this.tableName = options.tableName ? escapePgIdentifier(options.tableName) : 'session';

      if (!this.schemaName && this.tableName.includes('"."')) {
        console.warn('DEPRECATION WARNING: Schema should be provided through its dedicated "schemaName" option rather than through "tableName"');
        this.tableName = this.tableName.replace(/^([^"]+)""\.""([^"]+)$/, '$1"."$2');
      }

      this.ttl = options.ttl;

      this.errorLog = options.errorLog || console.error.bind(console);

      if (options.pool !== undefined) {
        this.pool = options.pool;
        this.ownsPg = false;
      } else if (options.pgPromise !== undefined) {
        if (typeof options.pgPromise.query !== 'function') {
          throw new TypeError('`pgPromise` config must point to an existing and configured instance of pg-promise pointing at your database');
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

      if (options.pruneSessionInterval === false) {
        /** @type {false|number} */
        this.pruneSessionInterval = false;
      } else {
        /** @type {false|number} */
        this.pruneSessionInterval = (options.pruneSessionInterval || DEFAULT_PRUNE_INTERVAL_IN_SECONDS) * 1000;
        if (options.pruneSessionRandomizedInterval !== false) {
          this.pruneSessionRandomizedInterval = (
            options.pruneSessionRandomizedInterval ||
            // Results in at least 50% of the specified interval and at most 150%. Makes it so that multiple instances doesn't all prune at the same time.
            (delay => Math.ceil(delay / 2 + delay * Math.random()))
          );
        }
        setImmediate(() => { this.pruneSessions(); });
      }
    }

    /**
     * Closes the session store
     *
     * Currently only stops the automatic pruning, if any, from continuing
     *
     * @access public
     */
    close () {
      this.closed = true;

      if (this.pruneTimer) {
        clearTimeout(this.pruneTimer);
        this.pruneTimer = undefined;
      }

      if (this.ownsPg) {
        this.pool.end();
      }
    }

    /**
     * Get a new prune delay
     *
     * @returns {number} the quoted schema + table for use in queries
     * @access private
     */
    getPruneDelay () {
      const delay = this.pruneSessionInterval;

      if (!delay) throw new Error('Can not calculate delay when pruning is inactivated');
      if (this.pruneSessionRandomizedInterval) return this.pruneSessionRandomizedInterval(delay);

      return delay;
    }

    /**
     * Does garbage collection for expired session in the database
     *
     * @param {SimpleErrorCallback} [fn] - standard Node.js callback called on completion
     * @access public
     */
    pruneSessions (fn) {
      this.query('DELETE FROM ' + this.quotedTable() + ' WHERE expire < to_timestamp($1)', [currentTimestamp()], err => {
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
          this.pruneTimer = setTimeout(
            () => { this.pruneSessions(); },
            this.getPruneDelay()
          );
          this.pruneTimer.unref();
        }
      });
    }

    /**
     * Get the quoted table.
     *
     * @returns {string} the quoted schema + table for use in queries
     * @access private
     */
    quotedTable () {
      let result = '"' + this.tableName + '"';

      if (this.schemaName) {
        result = '"' + this.schemaName + '".' + result;
      }

      return result;
    }

    /**
     * Figure out when a session should expire
     *
     * @param {number} [maxAge] - the maximum age of the session cookie
     * @returns {number} the unix timestamp, in seconds
     * @access private
     */
    getExpireTime (maxAge) {
      let ttl = this.ttl;

      ttl = ttl || (typeof maxAge === 'number' ? maxAge / 1000 : ONE_DAY);
      ttl = Math.ceil(ttl + currentTimestamp());

      return ttl;
    }

    /**
     * Query the database.
     *
     * @param {string} query - the database query to perform
     * @param {any[]|PGStoreQueryCallback} [params] - the parameters of the query or the callback function
     * @param {PGStoreQueryCallback} [fn] - standard Node.js callback returning the resulting rows
     * @access private
     */
    query (query, params, fn) {
      if (typeof params === 'function') {
        if (fn) throw new Error('Two callback functions set at once');
        fn = params;
        params = [];
      }

      if (this.pgPromise) {
        this.pgPromise.query(query, params || [])
          .then(
            /** @param {PGStoreQueryResult} res */
            // eslint-disable-next-line unicorn/no-null
            res => { fn && fn(null, res && res[0] ? res[0] : undefined); }
          )
          .catch(
            /** @param {Error} err */
            err => { fn && fn(err); }
          );
      } else {
        this.pool.query(
          query,
          params || [],
          (err, res) => { fn && fn(err, res && res.rows[0] ? res.rows[0] : undefined); }
        );
      }
    }

    /**
     * Attempt to fetch session by the given `sid`.
     *
     * @param {string} sid – the session id
     * @param {(err: Error|null, firstRow?: PGStoreQueryResult) => void} fn – a standard Node.js callback returning the parsed session object
     * @access public
     */
    get (sid, fn) {
      this.query('SELECT sess FROM ' + this.quotedTable() + ' WHERE sid = $1 AND expire >= to_timestamp($2)', [sid, currentTimestamp()], (err, data) => {
        if (err) { return fn(err); }
        // eslint-disable-next-line unicorn/no-null
        if (!data) { return fn(null); }
        try {
          // eslint-disable-next-line unicorn/no-null
          return fn(null, (typeof data.sess === 'string') ? JSON.parse(data.sess) : data.sess);
        } catch (err_) {
          return this.destroy(sid, fn);
        }
      });
    }

    /**
     * Commit the given `sess` object associated with the given `sid`.
     *
     * @param {string} sid – the session id
     * @param {SessionObject} sess – the session object to store
     * @param {SimpleErrorCallback} fn – a standard Node.js callback returning the parsed session object
     * @access public
     */
    set (sid, sess, fn) {
      const expireTime = this.getExpireTime(sess.cookie.maxAge);
      const query = 'INSERT INTO ' + this.quotedTable() + ' (sess, expire, sid) SELECT $1, to_timestamp($2), $3 ON CONFLICT (sid) DO UPDATE SET sess=$1, expire=to_timestamp($2) RETURNING sid';

      this.query(
        query,
        [sess, expireTime, sid],
        err => { fn && fn(err); }
      );
    }

    /**
     * Destroy the session associated with the given `sid`.
     *
     * @param {string} sid – the session id
     * @param {SimpleErrorCallback} fn – a standard Node.js callback returning the parsed session object
     * @access public
     */
    destroy (sid, fn) {
      this.query(
        'DELETE FROM ' + this.quotedTable() + ' WHERE sid = $1',
        [sid],
        err => { fn && fn(err); }
      );
    }

    /**
     * Touch the given session object associated with the given session ID.
     *
     * @param {string} sid – the session id
     * @param {SessionObject} sess – the session object to store
     * @param {SimpleErrorCallback} fn – a standard Node.js callback returning the parsed session object
     * @access public
     */
    touch (sid, sess, fn) {
      const expireTime = this.getExpireTime(sess.cookie.maxAge);

      this.query(
        'UPDATE ' + this.quotedTable() + ' SET expire = to_timestamp($1) WHERE sid = $2 RETURNING sid',
        [expireTime, sid],
        err => { fn && fn(err); }
      );
    }
  }

  return PGStore;
};
