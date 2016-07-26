/**
 * Transaction object. Represents a single request
 *
 * @see: https://github.com/watson/talks/blob/master/2016/06%20NodeConf%20Oslo/example-app/stats/transaction.js
 */
'use strict'

var util = require('util');
var Trace = require('./trace');

// Threshold (in ms) to report.
// Anything faster than this will not be reported to AppEnlight
var SLOW_THRESHOLD = 1000;

var hostname = require('os').hostname();

function Transaction(ae, req, res, tags) {
	this.traces = [];
	this.status = 200;
	this.ended = false;
	this.rootTrace = this.newTrace('main');

	this.id = req.id;
	this.ae = ae;
	this.start_time = new Date();
	this.req = req;
	this.res = res;
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
	this.name = [this.req.method, this.req.path].join(':');

}

/**
 * Trace an indivudal function
 *
 * @param type: Type of stat, either "custom", "nosql", "sql", "remote", or "tmpl"
 * @param name: Name of the function to trace
 * @param params: (Optional) Parameters, for tracking purposes
 * @return: Callback function to execute on completion of function
 */
Transaction.prototype.newTrace = function newTrace(type, name, params) {
	var trans = this;
	return new Trace(type, name, params, function traceCallback(trace) {
		if (trans.ended) return;

		// Update our stats
		try{
			//trans.stats[type] += completion_time;
			trans.stats[type] = trace.duration/1000;
			if(type !== 'main'){
				trans.stats[type + '_calls']++;

				// Only track slow traces
				if(trace.duration > 50 ){
					console.log('Slow Call', trace.type, trace.name, trace.duration);
					trans.traces.push(trace);
				}
			}
		} catch(e){
			console.error('AppEnlight Critical Error completing trace', e);
		}

	})
}

/**
 * Mark this request as completed and send metrics to AppEnlight
 *
 * @param err: An optional "Error" object that occurred during this execution
 */
Transaction.prototype.end = function endTransaction(err) {
	var self = this;
	if(!self.ended){
		self.rootTrace.end();
		self.ended = true;

		self.stats.main = self.rootTrace.duration/1000;
		var slow_calls = self.traces.filter(function (trace) {
			// Only track non-root traces that are over 1ms
			return trace !== self.rootTrace && trace.duration > 1;
		}).map(function (trace) {
			return trace.stats;
		});

		if(err || self.rootTrace.duration > SLOW_THRESHOLD || self.res.statusCode >= 400){
			var data = {
				client: 'express-appenlight',
				language: 'node.js',
				view_name: self.name,
				server: hostname,
				http_status: self.res.statusCode,
				ip: self.req.ip,
				start_time: self.start_time.toISOString(),
				end_time: (new Date()).toISOString(),
				user_agent: self.req.user_agent,
				request_id: self.id || self.req.id,
				request: {
					REQUEST_METHOD: self.req.method,
					PATH_INFO: self.req.path,
				},
				tags: self.tags,
				request_stats: self.stats,
				slow_calls: slow_calls,
			};
			if(self.req.query){
				data.request.QUERY = self.req.query;
			}
			if(self.req.user){
				data.username = self.req.user.displayName || self.req.user.$id;
			}
			if(err){
				data.error = err.toString();
			} else if(self.res.statusCode >= 400){
				data.error = 'HTTP Error:' + self.res.statusCode;
			}
			console.log('REPORT', data);
			// Queue up this report to send in a batch
			self.ae.reportBatch.push(data);
		}

		// Always send Metrics if it took more than 0 time
		if(self.stats.main > 0){
			/*
			self.ae.metricsBatch.push([
				self.name,
				self.stats,
			]);
			*/
		}
	}
}

module.exports = Transaction;
