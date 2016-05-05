var assert = require("assert"),
	ExpressJsResponse = require('./mock/ExpressJsResponse'),
	ExpressJsRequest = require('./mock/ExpressJsRequest'),
	rewire = require("rewire"),
	sinon = require("sinon");

var SECOND = 1000,
	MINUTE = 60 * SECOND;

var crispHttpCache = rewire("../main");

var equalOrig = assert.equal;
assert.equal = function(actual, expected, message) {
	if(actual instanceof Date && expected instanceof Date) {
		return equalOrig(actual.getTime(), expected.getTime(), message);
	}
	return equalOrig.apply(this, arguments);
};

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

	it("Should throw an error if we made a bad cache-control", function (done) {
		var mockResponse = new ExpressJsResponse({
			headers: {
				'cache-control': 'no-cache, max-age=b3000, s-maxage=s600'
			}
		});

		getTtlFromheaders(null, mockResponse, function (err, result) {
			assert.ok(err);
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

describe("transformHeaders", function () {

	var clock,
		transformHeaders = crispHttpCache.__get__("_transformHeaders"),
		res;

	beforeEach(function () {
		clock = sinon.useFakeTimers(1451610000000);
		res = new ExpressJsResponse();
	});

	afterEach(function () {
		clock.restore();
	});

	it("shouldn't override set headers", function () {
		var expiresDate = new Date(Date.now() + 300 * SECOND);
		var res = new ExpressJsResponse({
			headers: {
				'cache-control': 'private, max-age=300',
				'expires': expiresDate
			}
		});
		transformHeaders(res);
		assert.equal(res.get('cache-control'), 'private, max-age=300');
		assert.equal(res.get('expires'), expiresDate.toUTCString());
		assert.equal(res.get('date'), new Date());
	});

	describe("Known Expiration", function () {

		it("should set output headers for a known expiration", function () {
			var deltaSeconds = 10 * 60;
			var expiresDate = new Date(Date.now() + deltaSeconds*1000).toUTCString();
			var res = new ExpressJsResponse({
				headers: {
					'expires': expiresDate
				}
			});
			transformHeaders(res);
			assert.equal(res.get('cache-control'), 'public, max-age=' + deltaSeconds + ', s-maxage=' + deltaSeconds);
			assert.equal(res.get('expires'), expiresDate);
			assert.equal(res.get('date'), new Date());
		});

		it("should handle an integer expiration as ms.", function () {
			var deltaSeconds = 10 * 60;
			var expiresDate = new Date(Date.now() + deltaSeconds*1000).toUTCString();
			var res = new ExpressJsResponse({
				headers: {
					'expires': deltaSeconds * 1000
				}
			});
			transformHeaders(res);
			assert.equal(res.get('cache-control'), 'public, max-age=' + deltaSeconds + ', s-maxage=' + deltaSeconds);
			assert.equal(res.get('expires'), expiresDate);
			assert.equal(res.get('date'), new Date());
		});

	});

	describe("Unknown Expiration", function () {

		it("should handle an integer expiration as ms.", function () {
			var intervalSeconds = 5 * 60;
			var expiresDate = new Date(Date.now() + intervalSeconds*1000).toUTCString();
			var res = new ExpressJsResponse({
				headers: {
					'date': new Date()
				}
			});
			transformHeaders(res, intervalSeconds * 1000);
			assert.equal(res.get('cache-control'), 'public, max-age=' + intervalSeconds + ', s-maxage=' + intervalSeconds);
			assert.equal(res.get('expires'), expiresDate);
			assert.equal(res.get('date'), new Date());
		});

	});

	describe("Never Expires", function () {

		it("should set output headers according to the spec", function () {
			var deltaSeconds = 31622400; //Seconds in a year
			var estExpiresDate = new Date(Date.now() + deltaSeconds*1000).toUTCString();
			var res = new ExpressJsResponse({
				headers: {
					'expires': Infinity
				}
			});
			transformHeaders(res);
			assert.equal(res.get('cache-control'), 'public, max-age=' + deltaSeconds + ', s-maxage=' + deltaSeconds);
			assert.equal(res.get('expires'), estExpiresDate);
			assert.equal(res.get('date'), new Date());
		});

	});

	describe("Never Cache", function () {

		it("should set output headers for immediate expiration", function () {
			var res = new ExpressJsResponse({
				headers: {
					'expires': 0
				}
			});
			transformHeaders(res);
			assert.equal(res.get('cache-control'), 'public, max-age=0, s-maxage=0');
			//Date is normally expected here but the spec has a special meaning for "0" meaning expire immediately.
			assert.equal(res.get('expires'), 0);
			assert.equal(res.get('date'), new Date());
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

		it("Should use cache if charset wasn't provided in Content-Type", function (done) {
			var mockRequest = new ExpressJsRequest({
				headers: {
					'Accept-Charset': 'utf-8, iso-8859-1;q=0.2'
				}
			});

			var mockCacheResponse = new ExpressJsResponse({
				headers: {
					'Content-Type': 'text/html'
				}
			});

			compareCacheWithHeaders(mockRequest, mockCacheResponse, function (err, shouldCache) {
				assert.ifError(err);
				assert.strictEqual(shouldCache, true);
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

	describe("Content Language", function () {
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
				headers: {}
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