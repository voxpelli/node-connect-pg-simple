'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const request = require('supertest');

chai.use(chaiAsPromised);
chai.should();

describe('Express', function () {
  const express = require('express');
  const session = require('express-session');
  const Cookie = require('cookiejar').Cookie;
  const signature = require('cookie-signature');

  const connectPgSimple = require('../../');
  const dbUtils = require('../db-utils');
  const conObject = dbUtils.conObject;
  const queryPromise = dbUtils.queryPromise;

  const secret = 'abc123';
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

  const appSetup = (store) => {
    const app = express();

    app.use(session({
      store,
      secret,
      resave: false,
      saveUninitialized: true,
      cookie: { maxAge }
    }));

    app.get('/', (req, res) => {
      res.send('Hello World!');
    });

    return app;
  };

  let sandbox;

  beforeEach(function () {
    sandbox = sinon.sandbox.create();

    return dbUtils.removeTables()
      .then(() => dbUtils.initTables());
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('main', function () {
    it('should generate a token', () => {
      const store = new (connectPgSimple(session))({ conObject });
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
      const store = new (connectPgSimple(session))({ conObject });
      const app = appSetup(store);

      return request(app)
        .get('/')
        .then(res => {
          const sessionCookie = new Cookie(res.header['set-cookie'][0]);
          const cookieValue = decodeURIComponent(sessionCookie.value);

          cookieValue.substr(0, 2).should.equal('s:');

          return signature.unsign(cookieValue.substr(2), secret);
        })
        .then(decodedCookie => queryPromise('SELECT sid FROM session WHERE sid = $1', [decodedCookie]))
        .should.eventually.have.nested.property('rowCount', 1);
    });

    it('should reuse existing session when given a cookie', () => {
      const store = new (connectPgSimple(session))({ conObject });
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
      const store = new (connectPgSimple(session))({ conObject });
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

    it('should invalidate a too old token', () => {
      const store = new (connectPgSimple(session))({ conObject, pruneSessionInterval: false });
      const app = appSetup(store);
      const agent = request.agent(app);

      const clock = sandbox.useFakeTimers(Date.now());

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
          return new Promise((resolve, reject) => store.pruneSessions(err => err ? reject(err) : resolve()));
        })
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .should.eventually.have.nested.property('rows[0].count', '2')
        .then(() => agent.get('/').expect(200))
        .then(() => {
          clock.tick(maxAge * 0.6);
          return new Promise((resolve, reject) => store.pruneSessions(err => err ? reject(err) : resolve()));
        })
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .should.eventually.have.nested.property('rows[0].count', '1');
    });
  });
});
