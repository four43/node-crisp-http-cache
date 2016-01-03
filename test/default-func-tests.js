var assert = require("assert"),
	ExpressJsResponse = require('./mock/ExpressJsResponse'),
	ExpressJsRequest = require('./mock/ExpressJsRequest'),
	rewire = require("rewire"),
	sinon = require("sinon");

var crispHttpCache = rewire("../main");

describe("shouldCache", function () {
	var shouldCache = crispHttpCache.__get__("_shouldCacheAlways");
	it("Should always cache", function (done) {
		shouldCache(null, null, function (err, result) {
			assert.ifError(err);
			assert.strictEqual(result, true);
			done();
		});
	});
});

describe("getKey", function () {
	var getKeyOrigUrl = crispHttpCache.__get__("_getKeyOrigUrl");
	it("Should use the request's originalUrl", function (done) {
		var req = {
			originalUrl: "hello/world.avi"
		};
		getKeyOrigUrl(req, null, function (err, result) {
			assert.ifError(err);
			assert.strictEqual(result, "hello/world.avi");
			done();
		});
	});
});

describe("getTtl", function () {

	var clock,
		getTtlFromheaders = crispHttpCache.__get__("_getTtlFromHeaders");

	beforeEach(function () {
		clock = sinon.useFakeTimers(1451610000000);
	});

	afterEach(function () {
		clock.restore();
	});


	it("Should use the request's cache-control header", function (done) {
		var mockResponse = new ExpressJsResponse({
			headers: {
				'cache-control': 'public, max-age=3000, s-maxage=600'
			}
		});

		getTtlFromheaders(null, mockResponse, function (err, result) {
			assert.ifError(err);
			assert.strictEqual(result, 600000);
			done();
		});
	});

	it("Should not cache because private", function (done) {
		var mockResponse = new ExpressJsResponse({
			headers: {
				'cache-control': 'private, max-age=3000, s-maxage=600'
			}
		});

		getTtlFromheaders(null, mockResponse, function (err, result) {
			assert.ifError(err);
			assert.strictEqual(result, 0);
			done();
		});
	});

	it("Should not cache because no-cache", function (done) {
		var mockResponse = new ExpressJsResponse({
			headers: {
				'cache-control': 'no-cache, max-age=3000, s-maxage=600'
			}
		});

		getTtlFromheaders(null, mockResponse, function (err, result) {
			assert.ifError(err);
			assert.strictEqual(result, 0);
			done();
		});
	});

	it("Should use the request's expires header", function (done) {
		var mockResponse = new ExpressJsResponse({
			headers: {
				'expires': 'Sat, 02 Jan 2016 23:25:08 GMT'
			}
		});

		getTtlFromheaders(null, mockResponse, function (err, result) {
			assert.ifError(err);
			assert.strictEqual(result, 167108000);
			done();
		});
	});
});

describe("compareCache", function () {

	var compareCacheWithHeaders = crispHttpCache.__get__("_compareCacheWithHeaders");

	it("Should use cache if accept headers match", function (done) {
		var mockRequest = new ExpressJsRequest({
			headers: {
				'Accept': 'gzip, deflate, sdch'
			}
		});

		var mockCacheResponse = new ExpressJsResponse({
			headers: {
				'Content-Encoding': 'gzip'
			}
		});

		compareCacheWithHeaders(mockRequest, mockCacheResponse, function(err, shouldCache) {
			assert.ifError(err);
			assert.strictEqual(shouldCache, true);
			done();
		});
	});
});