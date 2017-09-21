'use strict';

/**
 * This is a replacement for
 * result.should.have.deep.property('rows[0].count', expectedValue)
 * which somehow does not work (with or without the promise wrapper from chai-as-promised)
 */
module.exports = Object.freeze({
  hasSingleRowWithCountProperty: function hasSingleRowWithCountProperty (expectedValue) {
    const resolve = (result) => {
      result.should.have.property('rows');
      result.rows.should.have.lengthOf(1);
      result.rows[0].count.should.equal(expectedValue);
      return result;
    };
    return resolve;
  }
});
