'use strict';

const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const proxyquire = require('proxyquire').noPreserveCache().noCallThru();
chai.use(sinonChai);

const should = chai.should();

describe('PGStore', function () {
  const connectPgSimple = require('../');

  const DEFAULT_DELAY = 60 * 5 * 1000;

  let PGStore, options;

  beforeEach(() => {
    PGStore = connectPgSimple({
      Store: sinon.stub()
    });

    options = {
      pool: {},
      pruneSessionInterval: false
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('pruneSessions', function () {
    let fakeClock;

    beforeEach(function () {
      fakeClock = sinon.useFakeTimers();
    });

    it('should by default run on randomized interval and close', async () => {
      const MOCKED_RANDOM = 0.1;
      const ACTUAL_DELAY = DEFAULT_DELAY / 2 + DEFAULT_DELAY * MOCKED_RANDOM;

      options.pruneSessionInterval = undefined;

      // Mocks and setup

      sinon.stub(Math, 'random').returns(MOCKED_RANDOM);

      const store = new PGStore(options);
      sinon.spy(store, 'pruneSessions');

      const mock = sinon.mock(store);
      mock.expects('query').twice().yields();

      // Execution

      await fakeClock.tickAsync(1);

      store.pruneSessions.callCount.should.equal(1, 'Called from constructor');

      await fakeClock.tickAsync(ACTUAL_DELAY);

      store.pruneSessions.callCount.should.equal(2, 'Called by interval');
      store.close();

      await fakeClock.tickAsync(ACTUAL_DELAY);

      store.pruneSessions.callCount.should.equal(2, 'Not called after close');
      mock.verify();
    });

    it('should use custom delay method when provided', async () => {
      const ACTUAL_DELAY = 10000;

      options.pruneSessionInterval = undefined;
      options.pruneSessionRandomizedInterval = sinon.stub().returns(ACTUAL_DELAY);

      // Mocks and setup

      const store = new PGStore(options);
      sinon.spy(store, 'pruneSessions');

      const mock = sinon.mock(store);
      mock.expects('query').twice().yields();

      // Execution

      await fakeClock.tickAsync(1);

      store.pruneSessions.callCount.should.equal(1, 'Called from constructor');

      await fakeClock.tickAsync(ACTUAL_DELAY);

      store.pruneSessions.callCount.should.equal(2, 'Called by interval');
      store.close();
      mock.verify();

      options.pruneSessionRandomizedInterval.should.have.been.calledTwice;
    });

    it('should run on exactly the default interval and close when no randomness', async () => {
      options.pruneSessionInterval = undefined;
      options.pruneSessionRandomizedInterval = false;

      // Mocks and setup

      const store = new PGStore(options);
      sinon.spy(store, 'pruneSessions');

      const mock = sinon.mock(store);
      mock.expects('query').twice().yields();

      // Execution

      await fakeClock.tickAsync(1);

      store.pruneSessions.callCount.should.equal(1, 'Called from constructor');

      await fakeClock.tickAsync(DEFAULT_DELAY);

      store.pruneSessions.callCount.should.equal(2, 'Called by interval');
      store.close();
      mock.verify();
    });

    it('should run on configurable interval', function () {
      options.pruneSessionInterval = 1;
      options.pruneSessionRandomizedInterval = false;

      const store = new PGStore(options);

      sinon.spy(store, 'pruneSessions');

      const mock = sinon.mock(store);

      mock.expects('query').twice().yields();

      return Promise.resolve()
        .then(function () {
          fakeClock.tick(1);
        })
        .then(function () {
          store.pruneSessions.callCount.should.equal(1, 'Called from constructor');
          fakeClock.tick(1000);
        })
        .then(function () {
          store.pruneSessions.callCount.should.equal(2, 'Called by custom interval');
          store.close();
          mock.verify();
        });
    });

    it('should not run when interval is disabled', function () {
      const store = new PGStore(options);

      sinon.spy(store, 'pruneSessions');

      const mock = sinon.mock(store);

      mock.expects('query').never().yields();

      return Promise.resolve()
        .then(function () {
          fakeClock.tick(1);
        })
        .then(function () {
          store.pruneSessions.called.should.equal(false, 'Not called from constructor');
          fakeClock.tick(60000);
        })
        .then(function () {
          store.pruneSessions.called.should.equal(false, 'Not called by interval');
          store.close();
          mock.verify();
        });
    });

    afterEach(function () {
      fakeClock.restore();
    });
  });

  describe('quotedTable', function () {
    it('should not include a schema by default', function () {
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"session"');
    });

    it('should have an overrideable table', function () {
      options.tableName = 'foobar';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"foobar"');
    });

    it('should have a definable schema', function () {
      options.schemaName = 'barfoo';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"barfoo"."session"');
    });

    it('should accept custom schema and table', function () {
      options.tableName = 'foobar';
      options.schemaName = 'barfoo';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"barfoo"."foobar"');
    });

    it('should accept legacy definition of schemas', function () {
      options.tableName = 'barfoo"."foobar';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"barfoo"."foobar"');
    });

    it('should not care about dots in names', function () {
      options.tableName = 'barfoo.foobar';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"barfoo.foobar"');
    });

    it('should escape table name', function () {
      options.tableName = 'foo"ba"r';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"foo""ba""r"');
    });

    it('should escape schema name', function () {
      options.schemaName = 'b""ar"foo';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"b""""ar""foo"."session"');
    });
  });

  describe('configSetup', function () {
    let poolStub;
    let ProxiedPGStore;
    let baseOptions;

    beforeEach(function () {
      delete process.env.DATABASE_URL;

      poolStub = sinon.stub();
      poolStub.prototype.on = () => {};

      const PGMock = { Pool: poolStub };
      const proxiedConnectPgSimple = proxyquire('../', { pg: PGMock });

      ProxiedPGStore = proxiedConnectPgSimple({
        Store: sinon.stub()
      });

      baseOptions = { pruneSessionInterval: false };
    });

    it('should support basic conString', function () {
      should.not.throw(function () {
        return new ProxiedPGStore(Object.assign(baseOptions, {
          conString: 'postgres://user:pass@localhost:1234/connect_pg_simple_test'
        }));
      });

      poolStub.should.have.been.calledOnce;
      poolStub.firstCall.args.should.have.lengthOf(1);
      poolStub.firstCall.args[0].should.deep.equal({
        connectionString: 'postgres://user:pass@localhost:1234/connect_pg_simple_test'
      });
    });

    it('should support basic conObject', function () {
      should.not.throw(function () {
        return new ProxiedPGStore(Object.assign(baseOptions, {
          conObject: {
            user: 'user',
            password: 'pass',
            host: 'localhost',
            port: 1234,
            database: 'connect_pg_simple_test'
          }
        }));
      });

      poolStub.should.have.been.calledOnce;
      poolStub.firstCall.args.should.have.lengthOf(1);
      poolStub.firstCall.args[0].should.deep.equal({
        user: 'user',
        password: 'pass',
        host: 'localhost',
        port: 1234,
        database: 'connect_pg_simple_test'
      });
    });
  });

  describe('pgPromise', function () {
    let poolStub;
    let ProxiedPGStore;
    let baseOptions;

    beforeEach(function () {
      delete process.env.DATABASE_URL;

      poolStub = sinon.stub();

      const PGMock = { Pool: poolStub };
      const proxiedConnectPgSimple = proxyquire('../', { pg: PGMock });

      ProxiedPGStore = proxiedConnectPgSimple({
        Store: sinon.stub()
      });

      baseOptions = { pruneSessionInterval: false };
    });

    it('should support pgPromise config', function () {
      should.not.throw(function () {
        return new ProxiedPGStore(Object.assign(baseOptions, {
          pgPromise: {
            query: function () {}
          }
        }));
      });
    });

    it('should throw on bad pgPromise', function () {
      should.throw(function () {
        return new ProxiedPGStore(Object.assign(baseOptions, {
          pgPromise: {}
        }));
      });
    });

    it('should pass parameters to pgPromise', function () {
      const queryStub = sinon.stub().resolves(true);
      const pgPromiseStub = {
        query: queryStub
      };

      const store = new ProxiedPGStore(Object.assign(baseOptions, {
        pgPromise: pgPromiseStub
      }));

      store.query('select', [1, 2]);

      queryStub.should.have.been.calledOnce;
      queryStub.firstCall.args[0].should.equal('select');
      queryStub.firstCall.args[1].should.deep.equal([1, 2]);
    });
  });
});
