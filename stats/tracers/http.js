/**
 * HTTP Request tracing
 */
'use strict';
var http = require('http');
var shimmer = require('shimmer');
var _ = require('lodash');

var OPTIONS_COPY_PROPS = [
	'href',
	'host',
	'hostname',
	'port',
	'method',
];

module.exports = function patchHTTP(agent){
	shimmer.wrap(http, 'request', function (original) {
		return function (options, callback) {
			if(agent && agent.currentTransaction){
				var params = _.pick(options, OPTIONS_COPY_PROPS);
				if(options.uri){
					params.query = options.uri.query;
					params.search = options.uri.search;
					params.path = options.uri.path;
					params.pathname = options.uri.pathname;
				}
				var trace = agent.currentTransaction.newTrace('remote',
					['http', options.method, options.hostname || options.host].join(':'),
					params
				);
				var returned = original.call(this, options, function(){
					trace.end();
					if(callback){
						callback.apply(this, arguments);
					}
				});
				return returned;
			} else {
				return original.apply(this, arguments);
			}
		};
	});
};
