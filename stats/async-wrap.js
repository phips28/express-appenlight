/**
 * Set up async_wrap to support maintaining a global state
 * between multiple asynchronous requests
 *
 * @see: https://github.com/watson/talks/blob/master/2016/06%20NodeConf%20Oslo/example-app/stats/async-wrap.js
 */
'use strict'

const asyncWrap = process.binding('async_wrap');
const TIMER = asyncWrap.Providers.TIMERWRAP;

module.exports = function asyncWrapper(agent) {

	const initState = new Map();
	const prevState = new Map();

	function init (uid, provider, parentUid, parentHandle) {
		if (provider === TIMER) return; // some timers share the handle, so we have to manage them manually
		initState.set(uid, agent.currentTransaction);
	}

	function pre (uid) {
		if (!initState.has(uid)) return; // in case provider === TIMER
		prevState.set(uid, agent.currentTransaction);
		agent.currentTransaction = initState.get(uid);
	}

	function post (uid) {
		if (!initState.has(uid)) return; // in case provider === TIMER
		agent.currentTransaction = prevState.get(uid);
	}

	function destroy (uid) {
		if (!initState.has(uid)) return; // in case provider === TIMER
		initState.delete(uid);
		prevState.delete(uid);
	}

	asyncWrap.setupHooks(init, pre, post, destroy);
	asyncWrap.enable();
};
