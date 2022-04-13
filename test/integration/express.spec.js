/* eslint-disable unicorn/no-await-expression-member */
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
const Cookie = require('cookiejar').Cookie;
const signature = require('cookie-signature');

const connectPgSimple = require('../..');
const dbUtils = require('../db-utils');
const conObject = dbUtils.conObject;
const queryPromise = dbUtils.queryPromise;

describe('Express', () => {
  const secret = 'abc123';
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  /** @type {import('../..').ExpressSessionStore} */
  let store;

  /**
   * @param {import('../..').ExpressSessionStore} store
   * @param {Partial<import('express-session').SessionOptions>} [sessionOptions]
   * @returns {import('express').Express}
   */
  const appSetup = (store, sessionOptions = {}) => {
    const app = express();

    app.use(session({
      store,
      secret,
      resave: false,
      rolling: true,
      saveUninitialized: true,
      cookie: { maxAge },
      ...sessionOptions
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

  afterEach(async () => {
    store && await store.close();
    sinon.restore();
  });

  describe('main', () => {
    it('should generate a token', () => {
      store = new (connectPgSimple(session))({ conObject });

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

    it('should return the token it generates', () => {
      store = new (connectPgSimple(session))({ conObject });

      const app = appSetup(store);

      return request(app)
        .get('/')
        .then(res => {
          const sessionCookie = new Cookie(res.header['set-cookie'][0]);
          const cookieValue = decodeURIComponent(sessionCookie.value);

          cookieValue.slice(0, 2).should.equal('s:');

          return signature.unsign(cookieValue.slice(2), secret);
        })
        .then(decodedCookie => queryPromise('SELECT sid FROM session WHERE sid = $1', [decodedCookie]))
        .should.eventually.have.nested.property('rowCount', 1);
    });

    it('should reuse existing session when given a cookie', () => {
      store = new (connectPgSimple(session))({ conObject });

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

    it('should not reuse existing session when not given a cookie', () => {
      store = new (connectPgSimple(session))({ conObject });

      const app = appSetup(store);

      return queryPromise('SELECT COUNT(sid) FROM session')
        .should.eventually.have.nested.property('rows[0].count', '0')
        .then(() => request(app).get('/'))
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .should.eventually.have.nested.property('rows[0].count', '1')
        .then(() => request(app).get('/').expect(200))
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .should.eventually.have.nested.property('rows[0].count', '2');
    });

    describe('touching', () => {
      it('should update expiry dates on existing sessions when rolling is set', async () => {
        const clock = sinon.useFakeTimers({ now: 1483228800000 });

        store = new (connectPgSimple(session))({ conObject });

        const app = appSetup(store);
        const agent = request.agent(app);

        (await queryPromise('SELECT expire FROM session')).should.have.nested.property('rows').that.is.empty;

        await agent.get('/');

        const firstResult = await queryPromise('SELECT extract(epoch from expire)::int AS expire FROM session');
        firstResult.should.have.property('rows').that.has.length(1)
          .with.nested.property('[0].expire').that.is.a('number');

        await clock.tickAsync(10000);

        await agent.get('/').expect(200);

        const secondResult = await queryPromise('SELECT extract(epoch from expire)::int AS expire FROM session');
        secondResult.should.have.property('rows').that.has.length(1)
          .with.nested.property('[0].expire').that.is.a('number');

        (secondResult.rows[0].expire - firstResult.rows[0].expire).should.equal(10);
      });

      it('should not update expiry dates on existing sessions when disableTouch is set', async () => {
        const clock = sinon.useFakeTimers({ now: 1483228800000 });

        store = new (connectPgSimple(session))({ conObject, disableTouch: true });

        const app = appSetup(store);
        const agent = request.agent(app);

        (await queryPromise('SELECT expire FROM session')).should.have.nested.property('rows').that.is.empty;

        await agent.get('/');

        const firstResult = await queryPromise('SELECT extract(epoch from expire)::int AS expire FROM session');
        firstResult.should.have.property('rows').that.has.length(1)
          .with.nested.property('[0].expire').that.is.a('number');

        await clock.tickAsync(10000);

        await agent.get('/').expect(200);

        const secondResult = await queryPromise('SELECT extract(epoch from expire)::int AS expire FROM session');
        secondResult.should.have.property('rows').that.has.length(1)
          .with.nested.property('[0].expire').that.is.a('number');

        (secondResult.rows[0].expire - firstResult.rows[0].expire).should.equal(0);
      });
    });

    it('should invalidate a too old token', () => {
      store = new (connectPgSimple(session))({ conObject, pruneSessionInterval: false });

      const app = appSetup(store);
      const agent = request.agent(app);

      const clock = sinon.useFakeTimers(Date.now());

      return queryPromise('SELECT COUNT(sid) FROM session')
        .should.eventually.have.nested.property('rows[0].count', '0')
        .then(() => Promise.all([
          request(app).get('/'),
          agent.get('/')
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
