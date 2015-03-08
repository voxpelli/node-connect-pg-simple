/* jshint node: true, expr: true */
/* global beforeEach, afterEach, describe, it, -Promise */

'use strict';

var chai = require('chai');
var sinon = require('sinon');
var Promise = require('promise');

chai.should();

describe('PGStore', function () {
  var connectPgSimple = require('../'),
    PGStore,
    options;

  beforeEach(function () {
    PGStore = connectPgSimple({
      Store: sinon.stub()
    });

    options = {
      pg: {},
      pruneSessionInterval: false
    };
  });

  describe('pruneSessions', function () {

    var fakeClock;

    beforeEach(function () {
      fakeClock = sinon.useFakeTimers();
    });

    it('should by default run on interval and close', function () {
      options.pruneSessionInterval = undefined;

      var store = new PGStore(options);

      sinon.spy(store, 'pruneSessions');

      var mock = sinon.mock(store);

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

      var store = new PGStore(options);

      sinon.spy(store, 'pruneSessions');

      var mock = sinon.mock(store);

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
      var store = new PGStore(options);

      sinon.spy(store, 'pruneSessions');

      var mock = sinon.mock(store);

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

});
