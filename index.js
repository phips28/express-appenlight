/**
 * Express.js Middleware to support the Metrics API of AppEnlight:
 *
 * @See: https://getappenlight.com/page/api/0.5/request_metrics.html
 *
 * @Author: Chris Moyer <cmoyer@aci.info>
 */
'use strict';
const request = require('request');
const hostname = require('os').hostname();

const API_ENDPOINT = 'https://api.appenlight.com/api/request_stats?protocol_version=0.5';

/**
 * AppEnlight Tracer, exposed as req.ae_tracer,
 * allows tracing individual function calls within an express.js app
 */
function AppEnlightTracer(name){
	this.start_time = new Date();
	this.metrics = [[
		name,
		{}
	]];
}

/**
 * Trace an indivudal function
 *
 * @param name: Name of the function to trace
 * @return: Callback function to execute on completion of function
 */
AppEnlightTracer.prototype.trace = function ae_trace(name){
	var self = this;
	var trace_start = new Date();
	return function trace_done(){
		var completion_time = new Date() - trace_start;
		self.metrics.push([
			name, {
				custom: completion_time/100,
			},
		]);
	};
};

/**
 * Mark this request as completed and send metrics to AppEnlight
 */
AppEnlightTracer.prototype.done = function ae_done(){
	var now = new Date();
	this.metrics[0][1].custom = (now-this.start_time)/100;
	request({
		method: 'POST',
		uri: API_ENDPOINT,
		headers: {
			'X-appenlight-api-key': this.api_key,
		},
		json: [{
			server: hostname,
			timestamp: now.toISOString(),
			metrics: this.metrics,
		}],
	});
};

function AppEnlight(api_key){
	this.api_key = api_key;
	var self = this;

	/**
	 * Router middleware for Express.js
	 */
	return function router(req, res, next){
		var routeName = [req.method, req.path].join(':');
		req.ae_tracer = new AppEnlightTracer(routeName);
		res.on('finish', function(){
			req.ae_tracer.done();
		});
		next();
	};
}

module.exports = AppEnlight;
