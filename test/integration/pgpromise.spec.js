'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const request = require('supertest');

chai.use(chaiAsPromised);
chai.should();

const hasSingleRowWithCountProperty = require('../promise-utils').hasSingleRowWithCountProperty;

describe('pgPromise', function () {
  const express = require('express');
  const session = require('express-session');
  const pgp = require('pg-promise')();

  const connectPgSimple = require('../../');
  const dbUtils = require('../db-utils');
  const conString = dbUtils.conString;
  const queryPromise = dbUtils.queryPromise;

  const secret = 'abc123';
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

  const pgPromise = pgp(conString);

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
      const store = new (connectPgSimple(session))({ pgPromise });
      const app = appSetup(store);

      return queryPromise('SELECT COUNT(sid) FROM session')
        .then(hasSingleRowWithCountProperty('0'))
        .then(() => request(app)
          .get('/')
          .expect(200)
        )
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .then(hasSingleRowWithCountProperty('1'));
    });

    it('should reuse existing session when given a cookie', () => {
      const store = new (connectPgSimple(session))({ pgPromise });
      const app = appSetup(store);
      const agent = request.agent(app);

      return queryPromise('SELECT COUNT(sid) FROM session')
        .then(hasSingleRowWithCountProperty('0'))
        .then(() => agent.get('/'))
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .then(hasSingleRowWithCountProperty('1'))
        .then(() => agent.get('/').expect(200))
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .then(hasSingleRowWithCountProperty('1'));
    });

    it('should invalidate a too old token', () => {
      const store = new (connectPgSimple(session))({ pgPromise, pruneSessionInterval: false });
      const app = appSetup(store);
      const agent = request.agent(app);

      const clock = sandbox.useFakeTimers(Date.now());

      return queryPromise('SELECT COUNT(sid) FROM session')
        .then(hasSingleRowWithCountProperty('0'))
        .then(() => Promise.all([
          request(app).get('/'),
          agent.get('/')
        ]))
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        .then(hasSingleRowWithCountProperty('2'))
        .then(() => {
          clock.tick(maxAge * 0.6);
          return new Promise((resolve, reject) => store.pruneSessions(err => err ? reject(err) : resolve()));
        })
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        // .should.eventually.have.deep.property('rows[0].count', '2')
        .then(hasSingleRowWithCountProperty('2'))
        .then(() => agent.get('/').expect(200))
        .then(() => {
          clock.tick(maxAge * 0.6);
          return new Promise((resolve, reject) => store.pruneSessions(err => err ? reject(err) : resolve()));
        })
        .then(() => queryPromise('SELECT COUNT(sid) FROM session'))
        // .should.eventually.have.deep.property('rows[0].count', '1');
        .then(hasSingleRowWithCountProperty('1'));
    });
  });
});
