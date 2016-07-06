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

function AppEnlight(api_key){
	this.api_key = api_key;
	var self = this;

	/**
	 * Router middleware for Express.js
	 */
	return function router(req, res, next){
		var start_time = new Date();
		res.on('finish', function(){
			var completion_time = new Date() - start_time;
			self.sendMetrics(req, res, completion_time);
		});
		next();
	};
}

/**
 * Send metrics to AppEnlight
 */
AppEnlight.prototype.sendMetrics = function sendMetrics(req, res, completion_time){
	var now = new Date();
	request({
		method: 'POST',
		uri: API_ENDPOINT,
		headers: {
			'X-appenlight-api-key': this.api_key,
		},
		json: [{
			server: hostname,
			timestamp: now.toISOString(),
			metrics: [
				[[req.method, req.path].join(':'),
					{
						custom: completion_time/100,
					},
				],
			],
		}],
	});
};

module.exports = AppEnlight;
