# express-appenlight
Support for the AppEnlight Metrics API for applications using express.js


## Initializing AppEnlight Tracer:


All that's needed to enable the tracer is to initialize it and set it up as middleware for your Express.js app:

```
var AppEnlight = require('express-appenlight');
app.use(new AppEnlight(conf.APPENLIGHT_KEY));
```

Once that's set up, every request will have an *ae_tracer* option.

## Tracing a custom function

Some functions are automatically traced, however to add in a custom trace you can use the *ae_tracer* function available on every request object.

Usage:

```
function (req, res, next){
	// Add a new trace
	var trace_completed = req.ae_tracer.trace('functionName');

	// Do your application logic
	... do stuff...

	// Call when everything is completed
	trace_completed();
}
```
