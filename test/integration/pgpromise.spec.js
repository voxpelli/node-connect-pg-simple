/* eslint-disable promise/prefer-await-to-then */
// @ts-check

'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const request = require('supertest');

chai.use(chaiAsPromised);
chai.should();

const express = require('express');
const session = require('express-session');
const pgp = require('pg-promise')();

const connectPgSimple = require('../..');
const dbUtils = require('../db-utils');
const conObject = dbUtils.conObject;
const queryPromise = dbUtils.queryPromise;

const pgPromise = pgp(conObject);

describe('pgPromise', () => {
  const secret = 'abc123';
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

  /**
   * @param {import('../..').ExpressSessionStore} store
   * @returns {import('express').Express}
   */
  const appSetup = (store) => {
    const app = express();

    app.use(session({
      store,
      secret,
      resave: false,
      saveUninitialized: true,
      cookie: { maxAge },
    }));

    app.get('/', (_req, res) => {
      res.send('Hello World!');
    });

    return app;
  };

  beforeEach(async () => {
    await dbUtils.removeTables();
    await dbUtils.initTables();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('main', () => {
    it('should generate a token', () => {
      const store = new (connectPgSimple(session))({ pgPromise });
      const app = appSetup(store);

      return queryPromise('SELECT COUNT(sid) FROM session')
        .should.eventually.have.nested.property('rows[0].count', '0')
        .then(() => request(app)
          .get('/')
          .expect(200)
        )
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .should.eventually.have.nested.property('rows[0].count', '1');
    });

    it('should reuse existing session when given a cookie', () => {
      const store = new (connectPgSimple(session))({ pgPromise });
      const app = appSetup(store);
      const agent = request.agent(app);

      return queryPromise('SELECT COUNT(sid) FROM session')
        .should.eventually.have.nested.property('rows[0].count', '0')
        .then(() => agent.get('/'))
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .should.eventually.have.nested.property('rows[0].count', '1')
        .then(() => agent.get('/').expect(200))
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .should.eventually.have.nested.property('rows[0].count', '1');
    });

    it('should invalidate a too old token', () => {
      const store = new (connectPgSimple(session))({ pgPromise, pruneSessionInterval: false });
      const app = appSetup(store);
      const agent = request.agent(app);

      const clock = sinon.useFakeTimers({ now: Date.now(), shouldClearNativeTimers: true });

      return queryPromise('SELECT COUNT(sid) FROM session')
        .should.eventually.have.nested.property('rows[0].count', '0')
        .then(() => Promise.all([
          request(app).get('/'),
          agent.get('/'),
        ]))
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .should.eventually.have.nested.property('rows[0].count', '2')
        .then(() => {
          clock.tick(maxAge * 0.6);
          // eslint-disable-next-line unicorn/no-useless-undefined
          return new Promise((resolve, reject) => store.pruneSessions(/** @param {Error} err */ err => { err ? reject(err) : resolve(undefined); }));
        })
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .should.eventually.have.nested.property('rows[0].count', '2')
        .then(() => agent.get('/').expect(200))
        .then(() => {
          clock.tick(maxAge * 0.6);
          // eslint-disable-next-line unicorn/no-useless-undefined
          return new Promise((resolve, reject) => store.pruneSessions(/** @param {Error} err */ err => { err ? reject(err) : resolve(undefined); }));
        })
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .should.eventually.have.nested.property('rows[0].count', '1');
    });
  });
});
