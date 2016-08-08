/**
 * Transaction object. Represents a single request
 *
 * @see: https://github.com/watson/talks/blob/master/2016/06%20NodeConf%20Oslo/example-app/stats/transaction.js
 */
'use strict'

var _ = require('lodash');
var util = require('util');
var uuid = require('uuid');
var Trace = require('./trace');

// Threshold (in ms) to report.
// Anything faster than this will not be reported to AppEnlight
var SLOW_THRESHOLD = 1000;

var hostname = require('os').hostname();

/**
 * Takes a meta object and "flattens" it into dot-separated tags
 */
function flattenObject(meta, tags, prefix){
	_.forEach(meta, function(val, key){
		if(prefix){
			key = [prefix, key].join('.');
		}
		if(_.isObject(val)){
			flattenObject(val, tags, key);
		} else {
			tags.push([key, util.format(val)]);
		}
	});
	return tags;
}

function Transaction(ae, req, res, tags) {
	this.traces = [];
	this.status = 200;
	this.ended = false;

	this.id = req.id;
	this.ae = ae;
	this.start_time = new Date();
	this.req = req;
	this.res = res;
	this.tags = flattenObject(tags, []);
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

	// Handle overlapping traces
	this.traceQueue = [];
	this.traceCursor = null;

	this.rootTrace = this.newTrace('main');
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
	var self = this;
	var traceID = [type, uuid.v4()].join(':');
	if(type !== 'main'){
		self.traceQueue.push(traceID);
	}

	var traceObj = new Trace(type, name, params, function traceCallback(trace) {
		if (self.ended) return;

		// Update our stats
		try{
			if(type === 'main'){
				self.stats[type] = trace.duration/1000;
			} else {
				self.stats[type + '_calls']++;
				var traceIndex = self.traceQueue.indexOf(traceID);
				if(traceIndex >= 0){
					// Remove this trace from the queue
					self.traceQueue.splice(traceIndex, 1);

					var duration = trace.duration/1000;
					if(self.traceCursor){
						var diff = process.hrtime(self.traceCursor);
						var ns = diff[0] * 1e9 + diff[1];
						duration = ns / 1e9;
					}

					if(self.traceQueue.length === 0){
						self.traceCursor = null;
						self.stats[type] += duration;
					} else {
						var lastTrace = self.traceQueue[self.traceQueue.length-1].split(':');
						if(lastTrace[0] !== type){
							self.traceCursor = process.hrtime();
							self.stats[type] += duration;
						}
					}

					// Only track slow traces
					if(trace.duration > 50 ){
						self.traces.push(trace);
					}
				}
			}
		} catch(e){
			console.error('AppEnlight Critical Error completing trace', e);
		}

	});

	traceObj.id = traceID;
	if(self.traceCursor === null){
		self.traceCursor = traceObj._start;
	}

	return traceObj;
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
				priority: 1,
			};
			if(self.req.query){
				data.request.QUERY = self.req.query;
			}
			if(self.req.user){
				data.username = self.req.user.displayName || self.req.user.$id;
			}
			if(err){
				data.error = err.toString();
				data.priority = 10;
			} else if(self.res.statusCode >= 400){
				data.error = 'HTTP Error:' + self.res.statusCode;
				data.priority = 5;
			}
			// Queue up this report to send in a batch
			if(self.ae){
				self.ae.reportBatch.push(data);
			}
		}

		// Always send Metrics if it took more than 0 time
		if(self.stats.main > 0 && self.ae){
			self.ae.metricsBatch.push([
				self.name,
				self.stats,
			]);

			// Custom metrics for remote calls
			// These stats are collected in the regular "metrics" API so
			// you can generate graphs for how long is spent on each remote request
			self.traces.filter(function (trace){
				// Only track remote requests with subtype http that contain a host or hostname
				return trace.type === 'remote' && trace.subtype === 'http' && (trace.params && (trace.params.host || trace.params.hostname));
			}).forEach(function(trace){
				self.ae.customMetricsBatch.push({
					timestamp: trace.stats.start,
					namespace: 'remote.http',
					server_name: hostname,
					tags: [
						['type', 'remote'],
						['subtype', 'http'],
						['method', trace.params.method || 'GET'],
						['hostname', trace.params.host || trace.params.hostname],
						['path', trace.params.path || ''],
						['pathname', trace.params.pathname || ''],
						['value', trace.duration/1000],
					],
				});
			});
		}
	}
}

module.exports = Transaction;
