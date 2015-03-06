/* jshint node: true */
/* global beforeEach, afterEach, describe, it */

'use strict';

var chai = require('chai');
var sinon = require('sinon');

chai.should();

describe('PGStore', function () {
  var connectPgSimple = require('../'),
    PGStore,
    clientExcpectation,
    pgStub,
    options;

  beforeEach(function () {
    PGStore = connectPgSimple({
      Store: sinon.stub()
    });

    clientExcpectation = sinon.expectation.create('pgClient').never();

    pgStub = {
      connect: sinon.stub().returns({
        client: clientExcpectation,
      })
    };

    options = {
      pg: pgStub,
      pruneSessionInterval: false
    };
  });

  afterEach(function () {
    clientExcpectation.verify();
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
