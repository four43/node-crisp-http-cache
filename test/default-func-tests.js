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

	describe("Accept/Content-Type", function () {
		it("Should use cache if accept headers match", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
					'Content-Type': 'text/html; charset=utf-8'
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, true);
				done();
			});
		});

		it("Should use cache if accept headers match, not explicitly in list, */* parsing", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
					'Content-Type': 'image/png'
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, true);
				done();
			});
		});

		it("Should not use cache if accept headers match not in list", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept': 'image/png'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
					'Content-Type': 'application/json'
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, false);
				done();
			});
		});
	});

	describe("Charset", function () {
		it("Should use cache if accept-charset matches", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept-Charset': 'utf-8, iso-8859-1;q=0.2, utf-7;q=0.5'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
					'Content-Type': 'text/html; charset=utf-8'
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, true);
				done();
			});
		});

		it("Should not use cache if accept-charset doesn't matches", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept-Charset': 'utf-8, iso-8859-1;q=0.2'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
					'Content-Type': 'text/html; charset=utf-7'
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, false);
				done();
			});
		});
	});

	describe("Encoding", function () {
		it("Should use cache if accept-encoding headers match", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept-Encoding': 'gzip, deflate, sdch'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
					'Content-Encoding': 'gzip'
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, true);
				done();
			});
		});

		it("Should use cache if accept-encoding headers aren't set", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept-Encoding': 'gzip, deflate, sdch'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, true);
				done();
			});
		});

		it("Should not use cache if accept-encoding headers don't match", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept-Encoding': 'gzip, deflate, sdch'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
					'Content-Encoding': 'hippos'
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, false);
				done();
			});
		});
	});

	describe("Content Language", function() {
		it("Should use cache if accept-language headers match", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept-Language': 'en-US,en;q=0.8'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
					'Content-Language': 'en'
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, true);
				done();
			});
		});

		it("Should use cache if accept-language headers aren't set", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept-Language': 'en-US,en;q=0.8'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, true);
				done();
			});
		});

		it("Should skip cache if accept-encoding headers aren't set", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept-Language': 'en-US,en;q=0.8'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
					'Content-Language': 'sp'
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, false);
				done();
			});
		});
	});
});