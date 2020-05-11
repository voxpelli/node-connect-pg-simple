// @ts-check

'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

chai.use(chaiAsPromised);
chai.use(sinonChai);
chai.should();

const session = require('express-session');

const connectPgSimple = require('../..');
const {
  initTables,
  queryPromise,
  removeTables
} = require('../db-utils');

describe('pg', () => {
  /** @type {import('../..').PGStoreOptions} */
  let options;

  beforeEach(() => {
    options = {
      pruneSessionInterval: false
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('table creation', () => {
    beforeEach(async () => {
      await removeTables();
    });

    it('should auto create table when requested', async () => {
      await queryPromise('SELECT COUNT(sid) FROM session').should.be.rejectedWith('relation "session" does not exist');

      const store = new (connectPgSimple(session))({ createTableIfMissing: true, ...options });
      const asyncQuerySpy = sinon.spy(store, '_asyncQuery');

      await store._ensureSessionStoreTable();

      asyncQuerySpy.should.have.been.calledTwice;

      await queryPromise('SELECT COUNT(sid) FROM session');
    });

    it('should not auto create table when already exists', async () => {
      await initTables();

      await queryPromise('SELECT COUNT(sid) FROM session');

      const store = new (connectPgSimple(session))({ createTableIfMissing: true, ...options });
      const asyncQuerySpy = sinon.spy(store, '_asyncQuery');

      await store._ensureSessionStoreTable();

      asyncQuerySpy.should.have.been.calledOnceWith('SELECT to_regclass($1::text)');

      await queryPromise('SELECT COUNT(sid) FROM session');
    });

    it('should not auto create table when not requested', async () => {
      await queryPromise('SELECT COUNT(sid) FROM session').should.be.rejectedWith('relation "session" does not exist');

      const store = new (connectPgSimple(session))(options);
      await store._ensureSessionStoreTable();

      await queryPromise('SELECT COUNT(sid) FROM session').should.be.rejectedWith('relation "session" does not exist');
    });

    it('should auto create table on first query', async () => {
      await queryPromise('SELECT COUNT(sid) FROM session').should.be.rejectedWith('relation "session" does not exist');

      const store = new (connectPgSimple(session))({ createTableIfMissing: true, ...options });
      const asyncQuerySpy = sinon.spy(store, '_asyncQuery');

      await store._asyncQuery('SELECT COUNT(sid) FROM session');

      asyncQuerySpy.should.have.been.calledThrice;

      await queryPromise('SELECT COUNT(sid) FROM session');
    });

    it("shouldn't start more than one table creation", async () => {
      await queryPromise('SELECT COUNT(sid) FROM session').should.be.rejectedWith('relation "session" does not exist');

      const store = new (connectPgSimple(session))({ createTableIfMissing: true, ...options });
      const asyncQuerySpy = sinon.spy(store, '_asyncQuery');
      const ensureSessionStoreTableSpy = sinon.spy(store, '_ensureSessionStoreTable');
      const rawEnsureSessionStoreTableSpy = sinon.spy(store, '_rawEnsureSessionStoreTable');

      await Promise.all([
        store._asyncQuery('SELECT COUNT(sid) FROM session'),
        store._asyncQuery('SELECT COUNT(sid) FROM session'),
        store._asyncQuery('SELECT COUNT(sid) FROM session')
      ]);

      asyncQuerySpy.should.have.been.called;
      asyncQuerySpy.callCount.should.equal(3 + 2);

      ensureSessionStoreTableSpy.should.have.been.called;
      ensureSessionStoreTableSpy.callCount.should.equal(3 + 2);

      rawEnsureSessionStoreTableSpy.should.have.been.calledOnce;

      await queryPromise('SELECT COUNT(sid) FROM session');
    });
  });
});
