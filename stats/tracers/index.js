/**
 * Customized Tracers
 *
 * @author: Chris Moyer <cmoyer@aci.info>
 */
'use strict';
module.exports = function patchTracers(agent){
	var fs = require('fs');
	fs.readdirSync(__dirname).forEach(function(fname){
		if(/^.*\.js$/.test(fname) && fname !== 'index.js'){
			require('./' + fname)(agent);
		}
	});
};
