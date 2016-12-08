# express-appenlight
Support for the AppEnlight Metrics API for applications using express.js


## Initializing AppEnlight Tracer:


All that's needed to enable the tracer is to initialize it and set it up as middleware for your Express.js app:

```
var AppEnlight = require('express-appenlight');
app.use(new AppEnlight({
	key: 'MY_APPENLIGHT_KEY',
	tags: {
		optional: 'TAGS',
	},
	base_url: 'http://custom-appenlight-url/api',
}, app));
```

Once that's set up, every request will have an *ae_transaction* option.

## Tracing a custom function

Some functions are automatically traced, however to add in a custom trace you can use the *ae_transaction.newTracer* function available on every request object.

Usage:

```
function (req, res, next){
	// Add a new trace
	var trace = req.ae_transaction.newTrace('custom', 'functionName', req.query);

	// Do your application logic
	... do stuff...

	// Call when everything is completed
	trace.end();
}
```

# Special Thanks

A special thanks to Thomas Watson (https://github.com/watson) for his great Node.js Oslo talk on Node.js performance monitoring.

This takes much of the code from: https://github.com/watson/talks/blob/master/2016/06%20NodeConf%20Oslo/example-app/stats
