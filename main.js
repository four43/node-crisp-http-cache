var CripsCache = require('crisp-cache'),
	debug = require('debug')('crisp-http-cache'),
	parseCacheControl = require('parse-cache-control');

/**
 *
 * @param {{}} options
 * @param {boolean} [options.enabled=true] A master switch of if we should cache or not, useful to set this to false while debugging.
 * @param {crispHttpCache~contextCallback} [options.shouldCache="Always true"] An async function that should resolve with a boolean
 * @param {crispHttpCache~contextCallback} [options.getKey="Use original req URL as key"] An async function that should resolve with a string key based on the request/response.
 * @param {crispHttpCache~contextCallback} [options.getTtl="Get from headers"] An async function that resolves with an integer for the TTL of response.
 * @param {crispHttpCache~contextCallback} [options.compareCache="Use ETag and headers"] An async function that resolves with boolean if the cached version matches the request.
 * @param {{}} [options.cacheOptions] Caching options sent directly to crisp-cache
 *
 * @see https://github.com/four43/node-crisp-cache For crisp-cache options
 *
 * @return {crispHttpCache~middleware}
 */
function crispHttpCache(options) {
	this.enabled = (options.enabled !== undefined) ? options.enabled : true;

	this.shouldCache = options.shouldCache || _shouldCacheAlways;
	this.getKey = options.getKey || _getKeyOrigUrl;
	this.getTtl = options.getTtl || _getTtlFromHeaders;
	this.compareCache = options.compareCache || _compareCacheWithHeaders;

	this.cacheOptions = options.cacheOptions || {};
	if (!this.cacheOptions.fetcher) {
		this.cacheOptions.fetcher = function (key, cb) {
			cb(new Error("Fetcher not defined yet."));
		}
	}
	this.cache = new CrispCache(options.cacheOptions);

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

						var originalSend = res.send;
						var cachedSend = function (body) {
							if (res.statusCode < 200 || res.statusCode >= 300) {
								debug("Non 2XX status code, not saving");
								return originalSend.call(res, body);
							}
							debug("Setting cache: " + key);
							var cachedEntry = {
								status: res.statusCode,
								headers: res._headers,
								body: body
							};

							// Update cache entry's ttl
							options.getTtl(req, res, function(err, ttl) {
								debug(" - With TTL: " + ttl);
								this.cache.set(key, cachedEntry, ttl);
								originalSend.call(res, body);
							}.bind(this));
						};

						this.cache.get(key, {skipFetch: true}, function (err, cacheValue) {
							if (cacheValue) {
								debug("Cache hit for: " + key);
								cacheValue.get = _getHeaders.bind(cacheValue);
								this.compareCache(req, cacheValue, function(err, cacheOkay) {
									if(err) {
										next(new Error("CrispHttpCache - Provided options.compareCache returned an error."));
									}

									if(cacheOkay) {
										res.set.call(res, cacheValue.headers);
										return res.send.call(res, cacheValue.body);
									}
									else {
										debug("Cache values did not pass compareCache, re-running.");
										res.send = cachedSend;
										return next();
									}
								});

							}
							else {
								debug("Cache miss for: " + key);
								res.send = cachedSend;
								return next();
							}
						}.bind(this));
					}.bind(this));
				}
				else {
					//shouldCache function said we should skip caching.
					return next();
				}
			});
		}
		else {
			//Caching disabled, skip
			return next();
		}
	}.bind(this);
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
 * @param {{}} req The request object
 * @param {string} req.originalUrl The original URL of the request
 * @param {{}} res The response object
 * @param {crispHttpCache~errFirstCallbackString} callback will be called with (err, {string})
 * @private
 */
function _getKeyOrigUrl(req, res, callback) {
	return callback(null, req.originalUrl);
}

/**
 * Parse Headers to get specific TTL for caching
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
 *
 * @param req
 * @param cachedResponse
 * @param {crispHttpCache~errFirstCallbackBool} callback holding the result if we should cache or not.
 * @private
 */
function _compareCacheWithHeaders(req, cachedResponse, callback) {
	//Accept
	if(cachedResponse.get('content-type')) {
		if(req.get('accept')) {
			if (!req.accepts(cachedResponse.get('content-type'))) {
				return callback(null, false);
			}
		}
		if(req.get('accept-charset')) {
			var contentTypeCharset = _parseContentTypeCharset(cachedResponse.get('content-type'))
			if (!req.acceptsCharsets(contentTypeCharset)) {
				return callback(null, false);
			}
		}
	}
	//Accept-Encoding
	if(cachedResponse.get('content-encoding') && req.get('accept-encoding')) {
		if(!req.acceptsEncodings(cachedResponse.get('content-encoding'))) {
			return callback(null, false);
		}
	}
	//Accept-Language
	if(cachedResponse.get('content-language') && req.get('accept-language')) {
		if(!req.acceptsLanguages(cachedResponse.get('content-language'))) {
			return callback(null, false);
		}
	}
	//If-Modified-Since
	//If-None-Match (ETag)
	return callback(null, true);
}

function _getHeaders(header) {
	return this._headers[header.toLowerCase()];
}

function _parseContentTypeCharset(contentTypeString) {
	var matches = contentTypeString.match(/charset=(\S+)/);
	if(matches) {
		return matches[1];
	}
	return false;
}

module.exports = crispHttpCache;

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

