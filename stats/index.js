/**
 * Node.js stats module
 *
 * @see: https://github.com/watson/talks/tree/master/2016/06%20NodeConf%20Oslo/example-app/stats/
 */
'use strict'

var agent = module.exports = {};

require('./async-hook')(agent); // Hook into nextTick, timers and Promise in Node core
require('./async-wrap')(agent); // Use AsyncWrap

require('./tracers')(agent); // Custom traces

var util = require('util');
var Transaction = require('./transaction');

agent.newTransaction = function newTransaction(ae, req, res, tags) {
	agent.currentTransaction = new Transaction(ae, req, res, tags);
	agent.currentTransaction.req = req;
	return agent.currentTransaction;
}

agent.newTrace = function newTrace(name) {
	if (!agent.currentTransaction) return;
	return agent.currentTransaction.newTrace(name);
}
