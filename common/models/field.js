'use strict';

var FieldTypes = require('../../server/field-types');

module.exports = function (Field) {

    Field.validate('type', function (err) {
        if (!FieldTypes.exists(this.type)) err();
    }, {message: 'Unknown type'});

};
