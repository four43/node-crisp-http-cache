var assert = require('assert'),
	async = require('async'),
	crispHttpCache = require('../../main'),
	express = require('express'),
	request = require('supertest'),
	sinon = require('sinon');

describe("Express Middleware", function () {

	var app,
		clock;

	beforeEach(function () {
		clock = sinon.useFakeTimers(1000);

		app = express();
		setupExpress(app);
	});

	afterEach(function () {
		clock.restore();
	});

	it("should cache basic", function (done) {
		request(app)
			.get('/hello')
			.expect('Expires', 'Thu, 01 Jan 1970 00:00:31 GMT')
			.expect(200)
			.end(function (err, res) {
				if (err) throw done(err);
				// Travel forward in time.
				clock.tick(10000);
				request(app)
					.get('/hello')
					.expect('Expires', 'Thu, 01 Jan 1970 00:00:31 GMT')
					.expect(200)
					.end(function (err, res) {
						if (err) throw done(err);
						done();
					});
			});
	});

	it("should be expired", function (done) {
		request(app)
			.get('/hello')
			.expect('Expires', 'Thu, 01 Jan 1970 00:00:31 GMT')
			.expect(200)
			.end(function (err, res) {
				if (err) throw done(err);
				// Travel forward in time.
				clock.tick(40000);
				request(app)
					.get('/hello')
					.expect('Expires', 'Thu, 01 Jan 1970 00:01:11 GMT')
					.expect(200)
					.end(function (err, res) {
						if (err) throw done(err);
						done();
					});
			});
	});

	it("should be infinity", function (done) {
		request(app)
			.get('/inf')
			.expect('Expires', 'Sat, 02 Jan 1971 00:00:01 GMT')
			.expect(200)
			.end(function (err, res) {
				if (err) throw done(err);
				done();
			});
	});

	it("should be respect max size", function (done) {
		async.parallel([
				function (cb) {
					request(app)
						.get('/hello')
						.expect('Expires', 'Thu, 01 Jan 1970 00:00:31 GMT')
						.expect(200)
						.end(cb);
				},
				function (cb) {
					request(app)
						.get('/world')
						.expect('Expires', 'Thu, 01 Jan 1970 00:00:11 GMT')
						.expect(200)
						.end(cb);
				}
			],
			function (err, results) {
				if (err) return done(err);
				// Travel forward in time.
				clock.tick(10000);
				request(app)
					.get('/hello')
					.expect('Expires', 'Thu, 01 Jan 1970 00:00:41 GMT')
					.expect(200)
					.end(function (err, res) {
						if (err) return done(err);
						done();
					});
			});
	});
});

function setupExpress(app) {
	app.use(crispHttpCache({
		cacheOptions: {
			maxSize: 50
		}
	}));

	app.get('/hello', function (req, res) {
		res.set('expires', new Date(Date.now() + 30000).toUTCString());
		res.send("Hello! " + (new Date).toISOString());
	});

	app.get('/world', function (req, res) {
		res.set('expires', new Date(Date.now() + 10000).toUTCString());
		res.send("World! " + (new Date).toISOString());
	});

	app.get('/inf', function (req, res) {
		res.set('expires', Infinity);
		res.send("World! " + (new Date).toISOString());
	});
}