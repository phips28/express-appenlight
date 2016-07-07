/**
 * Express.js Middleware to support the Metrics API of AppEnlight:
 *
 * @See: https://getappenlight.com/page/api/0.5/request_metrics.html
 *
 * @Author: Chris Moyer <cmoyer@aci.info>
 */
'use strict';
var uuid = require('uuid');
var request = require('request');
var hostname = require('os').hostname();
var CLS = require('continuation-local-storage');

var NS = CLS.createNamespace('AppEnlight');

var METRICS_API_ENDPOINT = 'https://api.appenlight.com/api/request_stats?protocol_version=0.5';
var REPORT_API_ENDPOINT = 'https://api.appenlight.com/api/reports?protocol_version=0.5';

// Threshold (in seconds) to report. Anything faster than this will not be reported to AppEnlight
var SLOW_THRESHOLD = 2;

/**
 * AppEnlight Tracer, exposed as req.ae_tracer,
 * allows tracing individual function calls within an express.js app
 */
function AppEnlightTracer(req, res, api_key, tags){
	this.id = req.id;
	this.start_time = new Date();
	this.req = req;
	this.res = res;
	this.api_key = api_key;
	this.slow_calls = [];
	this.tags = tags;
	this.stats = {
		main: 0,
		nosql: 0,
		nosql_calls: 0,
		remote: 0,
		remote_calls: 0,
		sql: 0,
		sql_calls: 0,
		tmpl: 0,
		tmpl_calls: 0,
		custom: 0,
		custom_calls: 0,
	};
}

/**
 * Trace an indivudal function
 *
 * @param type: Type of stat, either "custom", "nosql", "sql", "remote", or "tmpl"
 * @param name: Name of the function to trace
 * @return: Callback function to execute on completion of function
 */
AppEnlightTracer.prototype.trace = function ae_trace(type, name){
	var self = this;
	var trace_start = new Date();
	return function trace_done(){
		var completion_time = (new Date() - trace_start)/100;
		self.stats[type] += completion_time;
		self.stats[type + '_calls']++;
	};
};

/**
 * Mark this request as completed and send metrics to AppEnlight
 */
AppEnlightTracer.prototype.done = function ae_done(){
	var now = new Date();
	var completion_time = (now - this.start_time)/100;
	// Only report requests slower than 2s
	if(completion_time > SLOW_THRESHOLD){
		this.stats.main = completion_time;
		var data = {
			client: 'express-appenlight',
			language: 'node.js',
			view_name: [this.req.method, this.req.path].join(':'),
			server: hostname,
			http_status: this.res.statusCode,
			ip: this.req.ip,
			start_time: this.start_time.toISOString(),
			end_time: now.toISOString(),
			user_agent: this.req.user_agent,
			request_id: this.id || this.req.id,
			request: {
				REQUEST_METHOD: this.req.method,
				PATH_INFO: this.req.path,
			},
			tags: this.tags,
			request_stats: this.stats,
		};
		if(this.req.user){
			data.username = this.req.user.username;
		}
		request({
			method: 'POST',
			uri: REPORT_API_ENDPOINT,
			headers: {
				'X-appenlight-api-key': this.api_key,
			},
			json: [data],
		}, function(e,r,b){
			if(!/^OK/.test(b)){
				console.error('AppEnlight REQUEST FAILED', data.request_id, b);
			}
		});
	}
};

// Trace HTTP request
var http = require('http');
var shimmer = require('shimmer');

shimmer.wrap(http, 'request', function (original) {
	return function (options, callback) {
		var tracer = NS.get('tracer');
		if(tracer){
			var trace_completed = NS.get('tracer').trace('remote', ['http', options.method, options.hostname || options.host].join(':'));
			var returned = original.call(this, options, function(){
				trace_completed();
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


function AppEnlight(api_key, tags){
	/**
	 * Router middleware for Express.js
	 */
	return function router(req, res, next){

		NS.bindEmitter(req);
		NS.bindEmitter(res);

		NS.run(function(){
			if(req.id === undefined){
				req.id = uuid.v4();
			}
			NS.set('request_id', req.id);

			req.ae_tracer = new AppEnlightTracer(req, res, api_key, tags);
			NS.set('tracer', req.ae_tracer);

			res.on('finish', function(){
				req.ae_tracer.done();
			});

			next();
		});
	};
}

module.exports = AppEnlight;
