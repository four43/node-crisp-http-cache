var CrispCache = require('crisp-cache'),
	debug = require('debug')('crisp-http-cache'),
	onFinished = require('on-finished'),
	parseCacheControl = require('parse-cache-control');

/**
 *
 * @param {{}} [options]
 * @param {boolean} [options.enabled=true] A master switch of if we should cache or not, useful to set this to false while debugging.
 * @param {crispHttpCache~contextCallback} [options.shouldCache="Always true"] An async function that should resolve with a boolean
 * @param {crispHttpCache~contextCallback} [options.getKey="Use original req URL as key"] An async function that should resolve with a string key based on the request/response.
 * @param {crispHttpCache~contextCallback} [options.getTtl="Get from headers"] An async function that resolves with an integer for the TTL of response.
 * @param {crispHttpCache~contextCallback} [options.compareCache="Use Headers to make sure this entry applies to request"] An async function that resolves with boolean if the cached version matches the request.
 * @param {crispHttpCache~contextCallback} [options.cacheClientMatch="Check ETag"] An async function that resolves with a boolean if the cached version is the exact version the client is requesting.
 * @param {crispHttpCache~contextCallback} [options.transformHeaders] Tries to normalize expires headers for expiration.
 * @param {{}} [options.cacheOptions] Caching options sent directly to crisp-cache
 *
 * @see https://github.com/four43/node-crisp-cache For crisp-cache options
 *
 * @return {crispHttpCache~middleware}
 */
function CrispHttpCache(options) {
	if (options === undefined) {
		options = {};
	}
	this.enabled = (options.enabled !== undefined) ? options.enabled : true;

	this.shouldCache = options.shouldCache || _shouldCacheAlways;
	this.getKey = options.getKey || _getKeyOrigUrl;
	this.getTtl = options.getTtl || _getTtlFromHeaders;
	this.compareCache = options.compareCache || _compareCacheWithHeaders;
	this.cacheClientMatch = options.cacheClientMatch || _matchModifiedOrETag;
	this.transformHeaders = options.transformHeaders || _transformHeaders;

	this.cacheOptions = options.cacheOptions || {};
	if (!this.cacheOptions.fetcher) {
		this.cacheOptions.fetcher = function (key, cb) {
			cb(new Error("Fetcher not defined yet."));
		}
	}
	this.cache = new CrispCache(this.cacheOptions);
}

CrispHttpCache.prototype.getExpressMiddleware = function () {
	return function (req, res, next) {
		if (this.enabled) {
			this.shouldCache(req, res, function (err, shouldCache) {
				if (err) {
					return next(new Error("CrispHttpCache - Provided options.shouldCache function returned an error."));
				}

				if (shouldCache) {
					this.getKey(req, res, function (err, key) {
						if (err || typeof key !== 'string' || key.length === 0) {
							return next(new Error("CrispHttpCache - Provided options.getKey function returned an error. Should return a string."));
						}

						this.cache.get(key, {skipFetch: true}, function (err, cacheValue) {
							if (cacheValue) {
								debug("Cache hit for: " + key);
								cacheValue.get = _getHeaders.bind(cacheValue);
								this.compareCache(req, cacheValue, function (err, cacheOkay) {
									if (err) {
										next(new Error("CrispHttpCache - Provided options.compareCache returned an error."));
									}

									if (cacheOkay) {
										this.cacheClientMatch(req, cacheValue, function (err, cachedExactMatch) {
											if (cachedExactMatch) {
												return res.sendStatus(304);
											}
											res.set.call(res, cacheValue.headers);
											return res.send.call(res, cacheValue.body);
										});
									}
									else {
										debug("Cache values did not pass compareCache, re-running.");
										this._interceptRes(req, res, key, this.getTtl, this.cache, this.transformHeaders);
										return next();
									}
								}.bind(this));

							}
							else {
								debug("Cache miss for: " + key);
								this._interceptRes(req, res, key, this.getTtl, this.cache, this.transformHeaders);
								return next();
							}
						}.bind(this));
					}.bind(this));
				}
				else {
					//shouldCache function said we should skip caching.
					return next();
				}
			}.bind(this));
		}
		else {
			//Caching disabled, skip
			return next();
		}
	}.bind(this);
};

CrispHttpCache.prototype._interceptRes = function(req, res, key, getTtl, cache) {
	saveBody(res);
	preFinish(res, function (res, data, cb) {
		this.transformHeaders(res);
		cb(null, res);
	}.bind(this));
	onFinished(res, function (err, res) {
		if (res.statusCode < 200 || res.statusCode >= 300) {
			debug("Non 2XX status code, not saving");
			return;
		}
		debug("Setting cache: " + key);
		var cachedEntry = {
			status:  res.statusCode,
			headers: res._headers,
			body:    res.body
		};

		// Update cache entry's ttl, set and send.
		getTtl(req, res, function (err, ttl) {
			debug(" - With TTL: " + ttl);
			// If we didn't get a hangup, we can cache it.
			if (res.body && res.body.length) {
				cache.set(key, cachedEntry, {size: res.body.length, expiresTtl: ttl});
			}
		});
	});
};

module.exports = CrispHttpCache;

function preFinish(res, cb) {
	var origSend = res.send;

	res.send = function (data) {
		var sendArgs = arguments;
		cb(res, data, function (err, res) {
			origSend.apply(res, sendArgs);
		});
	}
}

function saveBody(res) {
	var oldWrite = res.write,
		oldEnd = res.end;

	var chunks = [];

	// Intercept write
	res.write = function (chunk) {
		chunks.push(chunk);
		oldWrite.apply(res, arguments);
	};

	// Intercept end
	res.end = function (chunk) {
		if (chunk)
			chunks.push(chunk);

		res.body = Buffer.concat(chunks);
		oldEnd.apply(res, arguments);
	};
}

/**
 * Determines if we should cache this request or not, executed before all other steps. Defaults to true.
 *
 * @param {{}} req The request object
 * @param {{}} res The response object
 * @param {crispHttpCache~errFirstCallbackBool} callback holding the result if we should cache or not.
 * @private
 */
function _shouldCacheAlways(req, res, callback) {
	return callback(null, true);
}

/**
 * Get our cache key based on our request's original request URL.
 *
 * @param {{}} req The request object
 * @param {string} req.originalUrl The original URL of the request
 * @param {string} req.method The HTTP verb used to create this response
 * @param {{}} res The response object
 * @param {crispHttpCache~errFirstCallbackString} callback will be called with (err, {string})
 * @private
 */
function _getKeyOrigUrl(req, res, callback) {
	return callback(null, req.method + req.originalUrl);
}

/**
 * Parse Headers to get specific TTL for caching
 *
 * @param {{}} req The request object
 * @param {{}} res The response object
 * @param {crispHttpCache~errFirstCallbackInt} callback will be called with (err, {int}) (Milliseconds for TTL)
 * @private
 */
function _getTtlFromHeaders(req, res, callback) {
	//cache-control header always takes precedence over expires: http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.9.3
	if (res.get('cache-control')) {
		var cacheControlInfo = parseCacheControl(res.get('cache-control'));

		if (!cacheControlInfo) {
			return callback(new Error('Failed to implement HTTP caching: failed to parse cache control headers'));
		}

		debug(cacheControlInfo);
		var isPrivate = cacheControlInfo['private'] || cacheControlInfo['no-cache'] || cacheControlInfo['no-store'];
		if (cacheControlInfo['s-maxage'] && !isPrivate) {
			return callback(null, parseInt(cacheControlInfo['s-maxage']) * 1000);
		}
		return callback(null, 0);
	}
	else if (res.get('expires')) {
		var now = new Date();
		return callback(null, new Date(res.get('expires')).getTime() - now.getTime());
	}
	else {
		callback(new Error("Could not get TTL via headers"));
	}
}

/**
 * Compare what we have cached with what the user requested, is this cached request applicable to this request?
 *
 * @param req
 * @param cachedResponse
 * @param {crispHttpCache~errFirstCallbackBool} callback holding the result if we should cache or not.
 * @private
 */
function _compareCacheWithHeaders(req, cachedResponse, callback) {
	//Accept
	if (cachedResponse.get('content-type')) {
		if (req.get('accept')) {
			if (!req.accepts(cachedResponse.get('content-type'))) {
				return callback(null, false);
			}
		}
		if (req.get('accept-charset')) {
			var contentTypeCharset = _parseContentTypeCharset(cachedResponse.get('content-type'))
			if (contentTypeCharset && !req.acceptsCharsets(contentTypeCharset)) {
				return callback(null, false);
			}
		}
	}
	//Accept-Encoding
	if (cachedResponse.get('content-encoding') && req.get('accept-encoding')) {
		if (!req.acceptsEncodings(cachedResponse.get('content-encoding'))) {
			return callback(null, false);
		}
	}
	//Accept-Language
	if (cachedResponse.get('content-language') && req.get('accept-language')) {
		if (!req.acceptsLanguages(cachedResponse.get('content-language'))) {
			return callback(null, false);
		}
	}
	return callback(null, true);
}

/**
 * Strictly compare what we have cached with what the user requested, is this cached request the version the user has already?
 *
 * @param req
 * @param cachedResponse
 * @param {crispHttpCache~errFirstCallbackBool} callback holding the result if we should cache or not.
 * @private
 */
function _matchModifiedOrETag(req, cachedResponse, callback) {
	//If-Modified-Since
	if (cachedResponse.get('date') && req.get('if-modified-since')) {
		if (new Date(cachedResponse.get('date')) <= new Date(req.get('if-modified-since'))) {
			return callback(null, true);
		}
	}
	//If-None-Match (ETag)
	if (cachedResponse.get('etag') && req.get('if-none-match')) {
		if (cachedResponse.get('etag') === req.get('if-none-match')) {
			return callback(null, true);
		}
	}

	//No existing cache information provided, the client doesn't seem to have this content yet.
	return callback(null, false);
}


function _transformHeaders(res, estExpiresInterval) {
	var responseCacheControl = res.get('cache-control'),
		responseExpires = _parseDateString(res.get('expires')),
		responseDate = res.get('date'),
		expiresDeltaMs = 0;

	//Known expiration
	if (responseExpires !== undefined) {
		if (responseExpires instanceof Date) {
			expiresDeltaMs = Math.round((responseExpires.getTime() - Date.now()));
		}
		else if (responseExpires === Infinity) {
			expiresDeltaMs = 31622400000; // 1 year
		}
		else {
			//If it's an integer, assume it's delta ms.
			expiresDeltaMs = responseExpires;
		}
	}
	else {
		if (responseDate && estExpiresInterval) {
			expiresDeltaMs = estExpiresInterval;
		}
	}


	if (responseCacheControl) {
		res.set('cache-control', responseCacheControl);
	}
	else {
		var expiresDeltaSeconds = Math.round(expiresDeltaMs / 1000);
		res.set('cache-control', 'public, max-age=' + expiresDeltaSeconds + ', s-maxage=' + expiresDeltaSeconds);
	}

	if (expiresDeltaMs > 0) {
		res.set('expires', new Date(Date.now() + expiresDeltaMs).toUTCString());
	}
	else {
		//HTTP Spec specifies if the response should immediately expired, a 0 is allowed.
		res.set('expires', 0);
	}

	if (!responseDate) {
		res.set('date', new Date());
	}
	else {
		res.set('date', responseDate);
	}
}

function _parseDateString(date) {
	if (date === 'Infinity') {
		return Infinity;
	}
	else if (!isNaN(parseInt(date))) {
		return parseFloat(date);
	} else if (!isNaN(Date.parse(date))) {
		return new Date(date);
	}
	else {
		return date;
	}
}

function _getHeaders(header) {
	return this.headers[header.toLowerCase()];
}

function _parseContentTypeCharset(contentTypeString) {
	var matches = contentTypeString.match(/charset=(\S+)/);
	if (matches) {
		return matches[1];
	}
	return false;
}

/**
 * A function that is provided with the current context of the request
 * @callback crispHttpCache~contextCallback
 * @param {{}} req
 * @param {{}} res
 * @param {function} callback
 */

/**
 * A typical middleware style function, but options may vary based on implementing library: Express, etc.
 * @callback crispHttpCache~middleware
 * @param {{}} req
 * @param {{}} res
 * @param {function} next
 */

/**
 * An error first callback, boolean result
 * @callback crispHttpCache~errFirstCallbackBool
 * @param {Error} err
 * @param {boolean} [result]
 */

/**
 * An error first callback, string result
 * @callback crispHttpCache~errFirstCallbackString
 * @param {Error} err
 * @param {string} [result]
 */

/**
 * An error first callback, int result
 * @callback crispHttpCache~errFirstCallbackInt
 * @param {Error} err
 * @param {int} [result]
 */

