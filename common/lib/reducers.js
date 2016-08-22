'use strict'

var assert = require('assert');
var logger = require('../utils/logger');

var reducers = {
    defaultReducer: function (values) {
		/**
	     * Default reducer function for combining response pieces. Maybe needs to be moved to reducers
	     * library.
	     * @param  {[type]} values [description]
	     * @return {[type]}        [description]
	     */
        assert.ok(Array.isArray(values), "argument 'values' must be a valid array.");

        var arr = [];
        for (let item of values) {
            if (item.result) {
                arr.push(item.result);
            } else {
                let err = new Error('Invalid piece of data for reducer: Item does not have argument result.');
                err.name = 'InvalidPieceResponseError';
                throw err;
            }
        }
        return {response: arr}
    },
	imageReducer: function (arrs) {
		var arr;
		var response;
        assert.ok(Array.isArray(arrs), "Invalid argument for reducer given. Array expected, " + typeof arrs + " found.");

        if (Array.isArray(arrs)) { 
        	var width = arrs[0].result.width
        	  , height = arrs[0].result.height
        	var bufs = [];
			var profilerData = [];

	        for (let item of arrs) {
	   			bufs.push(item.result.data);
	   			if (item.profiler && item.profiler.enabled) {
	   					profilerData.push({pieceId:item.pieceId, data:item.profiler.data});
	   				// if (Array.isArray(item.profiler.data)) {
	   				// } else {
	   				// 	logger.warn('Hub returned invalid profiler data. Array required.');
	   				// }
	   			}
	        }
	        // Nice way to concatenate n arrays
	        arr = [].concat.apply([], bufs);
	        if (profilerData.length > 0) {
	        	[].concat.apply([], profilerData);
	        }
	    } else {
	    	throw new TypeError('Invalid parameter type, Array needed. ' + typeof arrs);
	    }
	    response = {
        	result: {
        		width: width,
        		height: height,
        		data: arr
        	}
        }
        if (profilerData.length > 0) {
        	response.profilerData = profilerData;
        }
        return response;
	}
}

var get = function (name) {
	return reducers[name] || false;
}

module.exports = {
	get: get

}
