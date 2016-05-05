var crispHttpCache = require('./main'),
	express = require('express'),
	request = require('request');

var SECOND = 1000;
var MINUTE = 60 * SECOND;

var app = express();

var cache = {};
var randKey = 'fq35gq5w5ehytqg5w6e5y';

app.get('/:resource/:id',
	function createMiddleware(app) {
		return function (req, res, next) {
			if (req.query.cacheSkip === randKey) {
				return next();
			}
			var key = req.params.resource + '__' + req.params.id;
			if (cache[key]) {
				res.send(cache[key]);
			}
			else {
				var body = '';
				request
					.get('http://localhost:3000/' + req.originalUrl + '?cacheSkip=' + randKey)
					.on('response', function (response) {
						response
							.on('data', function (data) {
								body += data;
							})
							.on('end', function () {
								console.log(body);
								cache[key] = body;
								res.send(body);
							});
					});
			}
		}
	}(app),
	function (req, res) {
		var expires = 1 * MINUTE;
		res.set('expires', expires);
		res.send('Hello World! ' + new Date() + '<br/><a href="#" onClick="location.reload()">Refresh</a>');
	}
);

var server = app.listen(3000, function () {
	var host = server.address().address;
	var port = server.address().port;

	console.log('Example app listening at http://%s:%s', host, port);
});