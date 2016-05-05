var crispHttpCache = require('../main'),
	express = require('express');

var app = express();

app.use(crispHttpCache({
	cacheOptions: {
		maxSize: 50
	}
}));

app.get('/hello', function(req, res) {
	res.set('expires', new Date(Date.now() + 30000));
	res.send("Hello! " + (new Date).toISOString());
});

app.get('/world', function(req, res) {
	res.send("World! " + (new Date).toISOString());
});

var listener = app.listen(9001, function() {
	console.log('Demo Server (with caching) started on port ' + listener.address().port);
});