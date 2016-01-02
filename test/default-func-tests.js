var assert = require("assert"),
	ExpressJsResponse = require('./mock/ExpressJsResponse'),
	rewire = require("rewire"),
	sinon = require("sinon");

var crispHttpCache = rewire("../main");

describe("shouldCache", function () {
	var shouldCache = crispHttpCache.__get__("_shouldCacheAlways");
	it("Should always cache", function (done) {
		shouldCache(null, null, function (err, result) {
			assert.equal(result, true);
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
			assert.equal(result, "hello/world.avi");
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
				'cache-control': 'public, max-age=0, s-maxage=600'
			}
		});

		getTtlFromheaders(null, mockResponse, function (err, result) {
			assert.equal(result, 600000);
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
			assert.equal(result, 167108000);
			done();
		});
	});
});