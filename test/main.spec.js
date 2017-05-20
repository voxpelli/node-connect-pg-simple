'use strict';

const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const proxyquire = require('proxyquire').noPreserveCache().noCallThru();
chai.use(sinonChai);

const should = chai.should();

describe('PGStore', function () {
  const connectPgSimple = require('../');

  let sandbox, PGStore, options;

  beforeEach(function () {
    sandbox = sinon.sandbox.create();

    PGStore = connectPgSimple({
      Store: sandbox.stub()
    });

    options = {
      pool: {},
      pruneSessionInterval: false
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('pruneSessions', function () {
    let fakeClock;

    beforeEach(function () {
      fakeClock = sandbox.useFakeTimers();
    });

    it('should by default run on interval and close', function () {
      options.pruneSessionInterval = undefined;

      const store = new PGStore(options);

      sandbox.spy(store, 'pruneSessions');

      const mock = sandbox.mock(store);

      mock.expects('query').twice().yields();

      return Promise.resolve()
        .then(function () {
          fakeClock.tick(1);
        })
        .then(function () {
          store.pruneSessions.callCount.should.equal(1, 'Called from constructor');
          fakeClock.tick(60000);
        })
        .then(function () {
          store.pruneSessions.callCount.should.equal(2, 'Called by interval');
          store.close();
          fakeClock.tick(60000);
        })
        .then(function () {
          store.pruneSessions.callCount.should.equal(2, 'Not called after close');
          mock.verify();
        });
    });

    it('should run on configurable interval', function () {
      options.pruneSessionInterval = 1;

      const store = new PGStore(options);

      sandbox.spy(store, 'pruneSessions');

      const mock = sandbox.mock(store);

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

      sandbox.spy(store, 'pruneSessions');

      const mock = sandbox.mock(store);

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
  });

  describe('configSetup', function () {
    let poolStub;
    let ProxiedPGStore;
    let baseOptions;

    beforeEach(function () {
      delete process.env.DATABASE_URL;

      poolStub = sinon.stub();

      const PGMock = { Pool: poolStub };
      const proxiedConnectPgSimple = proxyquire('../', { pg: PGMock });

      ProxiedPGStore = proxiedConnectPgSimple({
        Store: sandbox.stub()
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
        user: 'user',
        password: 'pass',
        host: 'localhost',
        port: 1234,
        database: 'connect_pg_simple_test'
      });
    });

    it('should support password less conString', function () {
      should.not.throw(function () {
        return new ProxiedPGStore(Object.assign(baseOptions, {
          conString: 'postgres://postgres@localhost/connect_pg_simple_test'
        }));
      });

      poolStub.should.have.been.calledOnce;
      poolStub.firstCall.args.should.have.lengthOf(1);
      poolStub.firstCall.args[0].should.deep.equal({
        user: 'postgres',
        password: undefined,
        host: 'localhost',
        port: undefined,
        database: 'connect_pg_simple_test'
      });
    });

    it('should throw when no connection details', function () {
      should.throw(function () {
        return new ProxiedPGStore(baseOptions);
      }, /No database connecting details/);
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
        Store: sandbox.stub()
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
