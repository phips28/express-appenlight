/**
 * Express.js Middleware to support the Metrics API of AppEnlight:
 *
 * @See: https://getappenlight.com/page/api/0.5/request_metrics.html
 *
 * @Author: Chris Moyer <cmoyer@aci.info>
 */
'use strict';
var _ = require('lodash');
var uuid = require('uuid');
var request = require('request');
var hostname = require('os').hostname();
var Batcher = require('batcher');
var stats = require('./stats');

var METRICS_API_ENDPOINT = 'https://api.appenlight.com/api/request_stats?protocol_version=0.5';
var REPORT_API_ENDPOINT = 'https://api.appenlight.com/api/reports?protocol_version=0.5';

var shimmer = require('shimmer');

function AppEnlight(api_key, tags, app){
	var self = this;
	self.api_key = api_key;

	// Batcher, allows us to queue up requests and only send them once every 5 seconds
	self.reportBatch = new Batcher(5000);
	self.reportBatch.on('ready', function submitValues(data){
		try{
			request({
				method: 'POST',
				uri: REPORT_API_ENDPOINT,
				headers: {
					'X-appenlight-api-key': self.api_key,
				},
				json: data,
			}, function(e,r,b){
				if(!/^OK/.test(b)){
					console.error('AppEnlight REQUEST FAILED', b, data);
				}
			});
		} catch (e){
			console.error('AppEnlight CRITICAL REQUEST FAILURE', e);
		}
	});
	
	// Also create a batcher for "Metrics"
	self.metricsBatch = new Batcher(60000);
	self.metricsBatch.on('ready', function submitMetrics(data){
		try{
			request({
				method: 'POST',
				uri: METRICS_API_ENDPOINT,
				headers: {
					'X-appenlight-api-key': self.api_key,
				},
				json: [{
					server: hostname,
					timestamp: (new Date()).toISOString(),
					metrics: data,
				}],
			}, function(e,r,b){
				if(!/^OK/.test(b)){
					console.error('AppEnlight REQUEST FAILED', b, data);
				}
			});
		} catch(e){
			console.error('AppEnlight CRITICAL REQUEST FAILURE', e);
		}
	});

	// Wrap the "use" function
	if(app){
		shimmer.wrap(app, 'use', function(originalUseFnc){
			return function appEnlightWrapper(originalFnc){
				var fns = arguments;
				_.forEach(fns, function(fn, index){
					if(typeof fn === 'function'){
						//
						// The function signature can effect what arguments are used to call the middleware,
						// if there are 4 arguments the first one is an "err" object, but if there are only 3
						// objects the "err" object is completely ignored. This is an oddity of Express that must
						// be properly handled in this wrapper or we completely break middleware such as "express-winston"
						//
						var args = fn.toString().match(/^[\s\(]*function[^(]*\(([^)]*)\)/)[1].replace(/\/\/.*?[\r\n]|\/\*(?:.|[\r\n])*?\*\//g, '').replace(/\s+/g, '').split(',');
						var fnName = fn.name || '(anonymous)';
						if(args && args.length === 4){
							fns[index] = function aeMiddlewareWrapper(err, req, res, next){
								return fn.apply(this, arguments);
							};
						} else {
							fns[index] = function aeMiddlewareWrapper(req, res, next){
								var tracer = req.ae_transaction.newTrace('custom', 'express:' + fnName);
								var originalNext = next;
								next = function(){
									tracer.end();
									originalNext.apply(this, arguments);
								};
								return fn.call(this, req, res, next);
							};
						}
					}
				});
				return originalUseFnc.apply(this, fns);
			};
		});
	}

	/**
	 * Router middleware for Express.js
	 */
	return function router(req, res, next){
		if(req.id === undefined){
			req.id = uuid.v4();
		}
		req.ae_transaction = stats.newTransaction(self, req, res, tags);

		res.on('finish', function(){
			if(req.ae_transaction.renderWrapperTracer){
				req.ae_transaction.renderWrapperTracer.end();
			}

			if(req.routeName){
				req.ae_transaction.name = req.routeName;
			} else if(req.route && req.route.stack && req.route.stack.length > 0  &&
				req.route.stack[req.route.stack.length-1].name &&
				req.route.stack[req.route.stack.length-1].name !== '<anonymous>'){

				// Automatic naming
				req.ae_transaction.name = req.route.stack[req.route.stack.length-1].name;
			}
			req.ae_transaction.status = res.statusCode;
			req.ae_transaction.end();

		});
		shimmer.wrap(res, 'render', function (original) {
			return function renderWrapper(name){
				req.ae_transaction.renderWrapperTracer = req.ae_transaction.newTrace('tmpl', 'Render:' + name);
				return original.apply(this, arguments);
			};
		});
		next();
	};
}


module.exports = AppEnlight;
