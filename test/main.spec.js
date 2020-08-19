// @ts-check

'use strict';

const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const proxyquire = require('proxyquire').noPreserveCache().noCallThru();
chai.use(sinonChai);

const should = chai.should();

const connectPgSimple = require('..');

process.on('unhandledRejection', reason => { throw reason; });

describe('PGStore', () => {
  const DEFAULT_DELAY = 60 * 15 * 1000;

  /** @type {import('..').ExpressSessionStore} */
  let PGStore;
  /** @type {import('..').PGStoreOptions} */
  let options;

  beforeEach(() => {
    PGStore = connectPgSimple({
      Store: class FakeStore {}
    });

    options = {
      // @ts-ignore
      pool: {},
      pruneSessionInterval: false
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('pruneSessions', () => {
    /** @type {import('sinon').SinonFakeTimers} */
    let fakeClock;

    beforeEach(() => {
      fakeClock = sinon.useFakeTimers();
    });

    it('should by default run on randomized interval and close', async () => {
      const MOCKED_RANDOM = 0.1;
      const ACTUAL_DELAY = DEFAULT_DELAY / 2 + DEFAULT_DELAY * MOCKED_RANDOM;

      delete options.pruneSessionInterval;

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

      delete options.pruneSessionInterval;
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
      delete options.pruneSessionInterval;
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

    it('should run on configurable interval', () => {
      options.pruneSessionInterval = 1;
      options.pruneSessionRandomizedInterval = false;

      const store = new PGStore(options);

      sinon.spy(store, 'pruneSessions');

      const mock = sinon.mock(store);

      mock.expects('query').twice().yields();

      return Promise.resolve()
        .then(() => {
          fakeClock.tick(1);
        })
        .then(() => {
          store.pruneSessions.callCount.should.equal(1, 'Called from constructor');
          fakeClock.tick(1000);
        })
        .then(() => {
          store.pruneSessions.callCount.should.equal(2, 'Called by custom interval');
          store.close();
          mock.verify();
        });
    });

    it('should not run when interval is disabled', () => {
      const store = new PGStore(options);

      sinon.spy(store, 'pruneSessions');

      const mock = sinon.mock(store);

      mock.expects('query').never().yields();

      return Promise.resolve()
        .then(() => {
          fakeClock.tick(1);
        })
        .then(() => {
          store.pruneSessions.called.should.equal(false, 'Not called from constructor');
          fakeClock.tick(60000);
        })
        .then(() => {
          store.pruneSessions.called.should.equal(false, 'Not called by interval');
          store.close();
          mock.verify();
        });
    });

    afterEach(() => {
      fakeClock.restore();
    });
  });

  describe('quotedTable', () => {
    it('should not include a schema by default', () => {
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"session"');
    });

    it('should have an overrideable table', () => {
      options.tableName = 'foobar';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"foobar"');
    });

    it('should have a definable schema', () => {
      options.schemaName = 'barfoo';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"barfoo"."session"');
    });

    it('should accept custom schema and table', () => {
      options.tableName = 'foobar';
      options.schemaName = 'barfoo';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"barfoo"."foobar"');
    });

    it('should accept legacy definition of schemas', () => {
      options.tableName = 'barfoo"."foobar';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"barfoo"."foobar"');
    });

    it('should not care about dots in names', () => {
      options.tableName = 'barfoo.foobar';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"barfoo.foobar"');
    });

    it('should escape table name', () => {
      options.tableName = 'foo"ba"r';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"foo""ba""r"');
    });

    it('should escape schema name', () => {
      options.schemaName = 'b""ar"foo';
      (new PGStore(options)).quotedTable().should.be.a('string').that.equals('"b""""ar""foo"."session"');
    });
  });

  describe('configSetup', () => {
    /** @type {import('sinon').SinonStub} */
    let poolStub;
    /** @type {import('..').ExpressSessionStore} */
    let ProxiedPGStore;
    /** @type {import('..').PGStoreOptions} */
    let baseOptions;

    beforeEach(() => {
      delete process.env.DATABASE_URL;

      poolStub = sinon.stub();
      poolStub.prototype.on = () => {};

      const PGMock = { Pool: poolStub };
      const proxiedConnectPgSimple = proxyquire('../', { pg: PGMock });

      ProxiedPGStore = proxiedConnectPgSimple({
        Store: class FakeStore {}
      });

      baseOptions = { pruneSessionInterval: false };
    });

    it('should support basic conString', () => {
      should.not.throw(() => {
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

    it('should support basic conObject', () => {
      should.not.throw(() => {
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

  describe('queries', () => {
    /** @type {import('sinon').SinonStub} */
    let poolStub;
    /** @type {import('sinon').SinonStub} */
    let queryStub;
    /** @type {import('..').ExpressSessionStore} */
    let store;

    beforeEach(() => {
      delete process.env.DATABASE_URL;

      queryStub = sinon.stub();

      poolStub = sinon.stub();
      poolStub.prototype.on = () => {};
      poolStub.prototype.query = queryStub;

      const PGMock = { Pool: poolStub };
      const proxiedConnectPgSimple = proxyquire('../', { pg: PGMock });

      const ProxiedPGStore = proxiedConnectPgSimple({
        Store: class FakeStore {}
      });

      const baseOptions = { pruneSessionInterval: false };

      store = new ProxiedPGStore(Object.assign(baseOptions, {
        conString: 'postgres://user:pass@localhost:1234/connect_pg_simple_test'
      }));
    });

    it('should properly handle successfull callback queries', done => {
      // eslint-disable-next-line unicorn/no-null
      queryStub.callsArgWith(2, null, { rows: ['hej'] });

      // @ts-ignore
      store.query('SELECT * FROM faketable', [], (err, value) => {
        // eslint-disable-next-line unicorn/no-null
        should.equal(err, null);
        should.equal(value, 'hej');
        done();
      });
    });

    it('should properly handle failing callback queries', done => {
      const queryError = new Error('Fail');

      queryStub.callsArgWith(2, queryError);

      // @ts-ignore
      store.query('SELECT * FROM faketable', [], (err, value) => {
        should.equal(err, queryError);
        should.not.exist(value);
        done();
      });
    });

    it('should properly handle param less query shorthand', done => {
      // eslint-disable-next-line unicorn/no-null
      queryStub.callsArgWith(2, null, { rows: ['hej'] });

      // @ts-ignore
      store.query('SELECT * FROM faketable', (err, value) => {
        // eslint-disable-next-line unicorn/no-null
        should.equal(err, null);
        should.equal(value, 'hej');
        done();
      });
    });

    it('should throw on two callbacks set at once', () => {
      // @ts-ignore
      should.Throw(() => {
        store.query('', () => {}, () => {});
      });
    });

    it('should handle successfull destroy call', done => {
      // eslint-disable-next-line unicorn/no-null
      queryStub.callsArgWith(2, null, { rows: ['hej'] });

      // @ts-ignore
      store.destroy('foo', (err) => {
        // eslint-disable-next-line unicorn/no-null
        should.equal(err, null);
        done();
      });
    });

    it('should handle failing destroy call', done => {
      const queryError = new Error('Fail');

      queryStub.callsArgWith(2, queryError);

      // @ts-ignore
      store.destroy('foo', (err) => {
        // eslint-disable-next-line unicorn/no-null
        should.equal(err, queryError);
        done();
      });
    });
  });

  describe('pgPromise', () => {
    /** @type {import('sinon').SinonStub} */
    let poolStub;
    /** @type {import('..').ExpressSessionStore} */
    let ProxiedPGStore;
    /** @type {import('..').PGStoreOptions} */
    let baseOptions;

    beforeEach(() => {
      delete process.env.DATABASE_URL;

      poolStub = sinon.stub();

      const PGMock = { Pool: poolStub };
      const proxiedConnectPgSimple = proxyquire('../', { pg: PGMock });

      ProxiedPGStore = proxiedConnectPgSimple({
        Store: class FakeStore {}
      });

      baseOptions = { pruneSessionInterval: false };
    });

    it('should support pgPromise config', () => {
      should.not.throw(() => {
        return new ProxiedPGStore(Object.assign(baseOptions, {
          pgPromise: {
            query: () => {}
          }
        }));
      });
    });

    it('should throw on bad pgPromise', () => {
      should.throw(() => {
        return new ProxiedPGStore(Object.assign(baseOptions, {
          pgPromise: {}
        }));
      });
    });

    it('should pass parameters to pgPromise', () => {
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

    it('should properly handle successfull callback queries', done => {
      const queryStub = sinon.stub().resolves(['hej']);
      const pgPromiseStub = {
        query: queryStub
      };

      const store = new ProxiedPGStore(Object.assign(baseOptions, {
        pgPromise: pgPromiseStub
      }));

      // @ts-ignore
      store.query('SELECT * FROM faketable', [], (err, value) => {
        // eslint-disable-next-line unicorn/no-null
        should.equal(err, null);
        should.equal(value, 'hej');
        done();
      });
    });

    it('should properly handle failing callback queries', done => {
      const queryError = new Error('Fail');

      const queryStub = sinon.stub().rejects(queryError);
      const pgPromiseStub = {
        query: queryStub
      };

      const store = new ProxiedPGStore(Object.assign(baseOptions, {
        pgPromise: pgPromiseStub
      }));

      // @ts-ignore
      store.query('SELECT * FROM faketable', [], (err, value) => {
        should.equal(err, queryError);
        should.not.exist(value);
        done();
      });
    });
  });
});
