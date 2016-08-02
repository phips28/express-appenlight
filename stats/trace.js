/**
 * A single Trace, profiled code
 *
 * @see: https://github.com/watson/talks/blob/master/2016/06%20NodeConf%20Oslo/example-app/stats/trace.js
 *
 * @author: Chris Moyer <cmoyer@aci.info>
 */
'use strict'

function Trace(type, name, params, onEnd){
	this.type = type;
	this.name = name;
	this.params = params;
	this._onEnd = onEnd;
	this._start = process.hrtime();

	this.stats = {
		start: (new Date()).toISOString(),
		type: type,
	};
	if(params){
		this.stats.parameters = params;
	}
	if(name){
		try{
			this.subtype = name.split(':')[0].substring(0,14);
			this.stats.subtype = this.subtype;
			if(name.split(':').length > 1){
				this.stats.statement = name;
			}
		} catch (e){
			console.error('AppEnlight: Invalid Trace Name', name, e);
		}
	}

}

Trace.prototype.end = function endTrace(){
	this._end = process.hrtime();
	this.stats.end = new Date().toISOString();
	var diff = process.hrtime(this._start);
	var ns = diff[0] * 1e9 + diff[1];
	this.duration = ns / 1e6;
	this._onEnd(this);
}

module.exports = Trace;
