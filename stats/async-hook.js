/**
 * Handle the things async_hook doesn't wrap
 *
 * @see: https://github.com/watson/talks/blob/master/2016/06%20NodeConf%20Oslo/example-app/stats/async-hook.js
 */
'use strict'

// The bulk of this code is borrowed from:
// https://github.com/othiym23/async-listener

var util = require('util');
var shimmer = require('shimmer');
var isNative = require('is-native');
var wrap = shimmer.wrap;
var massWrap = shimmer.massWrap;

module.exports = function (agent) {
	function wrapCallback (original) {
		if (typeof original !== 'function') return original;

		var trans = agent.currentTransaction;

		return function instrumented () {
			var prev = agent.currentTransaction;
			agent.currentTransaction = trans;
			var result = original.apply(this, arguments);
			agent.currentTransaction = prev;
			return result;
		};
	}

	wrap(process, 'nextTick', activatorFirst);

	var asynchronizers = [
		'setTimeout',
		'setInterval',
	];
	if (global.setImmediate) asynchronizers.push('setImmediate');

	var timers = require('timers');
	var patchGlobalTimers = global.setTimeout === timers.setTimeout;

	massWrap(
		timers,
		asynchronizers,
		activatorFirst
	);

	if (patchGlobalTimers) {
		massWrap(
			global,
			asynchronizers,
			activatorFirst
		);
	}

	// Here use to be instrumentation for Promises, but that caused
	// things to break pretty badly, so it was removed.

	// Shim activator for functions that have callback first
	function activatorFirst (fn) {
		var fallback = function () {
			if (typeof arguments[0] === 'function') {
				arguments[0] = wrapCallback(arguments[0]);
			}
			return fn.apply(this, arguments);
		}
		// Preserve function length for small arg count functions.
		switch (fn.length) {
			case 1:
				return function (cb) {
					if (arguments.length !== 1) return fallback.apply(this, arguments);
					if (typeof cb === 'function') cb = wrapCallback(cb);
					return fn.call(this, cb);
				}
			case 2:
				return function (cb, a) {
					if (arguments.length !== 2) return fallback.apply(this, arguments);
					if (typeof cb === 'function') cb = wrapCallback(cb);
					return fn.call(this, cb, a);
				}
			case 3:
				return function (cb, a, b) {
					if (arguments.length !== 3) return fallback.apply(this, arguments);
					if (typeof cb === 'function') cb = wrapCallback(cb);
					return fn.call(this, cb, a, b);
				}
			case 4:
				return function (cb, a, b, c) {
					if (arguments.length !== 4) return fallback.apply(this, arguments);
					if (typeof cb === 'function') cb = wrapCallback(cb);
					return fn.call(this, cb, a, b, c);
				}
			case 5:
				return function (cb, a, b, c, d) {
					if (arguments.length !== 5) return fallback.apply(this, arguments);
					if (typeof cb === 'function') cb = wrapCallback(cb);
					return fn.call(this, cb, a, b, c, d);
				}
			case 6:
				return function (cb, a, b, c, d, e) {
					if (arguments.length !== 6) return fallback.apply(this, arguments);
					if (typeof cb === 'function') cb = wrapCallback(cb);
					return fn.call(this, cb, a, b, c, d, e);
				}
			default:
				return fallback;
		}
	}
}
