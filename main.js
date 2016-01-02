var CripsCache = require('crisp-cache'),
	debug = require('debug')('crisp-http-cache'),
	parseCacheControl = require('parse-cache-control');

/**
 *
 * @param {{}} options
 * @param {boolean} [options.enabled=true] A master switch of if we should cache or not, useful to set this to false while debugging.
 * @param {crispHttpCache~errFirstCallbackBool} [options.shouldCache="Always true"] An async function that should resolve with a boolean
 * @param {crispHttpCache~errFirstCallbackString} [options.getKey="Use original req URL as key"] An async function that should resolve with a string key based on the request/response.
 * @param {crispHttpCache~errFirstCallbackInt} [options.getTtl="Get from headers"] An async function that resolves with an integer for the TTL of response.
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

						this.cache.get(key, {skipFetch: true}, function (err, cacheValue) {
							if (cacheValue) {
								debug("Cache hit for: " + key);
								//@todo compare ETags
								res.set.call(res, cacheValue.headers);
								return res.send.call(res, cacheValue.body);
							}
							else {
								debug("Cache miss for: " + key);
								var originalSend = res.send;
								res.send = function (body) {
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
									options.getTtl(req, res, (err, ttl) => {
										debug(" - With TTL: " + ttl);
										this.cache.set(key, cachedEntry, ttl);
										originalSend.call(res, body);
									});
								};
								return next();
							}
						});
					});
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
 */
function _shouldCacheAlways(req, res, callback) {
	return callback(null, true);
}

/**
 * Get our cache key based on our request's original request URL.
 * @param {{}} req The request object
 * @param {string} req.originalUrl The original URL of the request
 * @param {{}} res The response object
 * @param {function} callback will be called with (err, {string})
 */
function _getKeyOrigUrl(req, res, callback) {
	return callback(null, req.originalUrl);
}

/**
 * Parse Headers to get specific TTL for caching
 * @param req
 * @param res
 * @param {function} callback will be called with (err, {int}) (Milliseconds for TTL)
 */
function _getTtlFromHeaders(req, res, callback) {
	if (res.get('cache-control')) {
		var cacheControlInfo = parseCacheControl(res.get('cache-control'));

		if (!cacheControlInfo) {
			return callback(new Error('Failed to implement HTTP caching: failed to parse cache control headers'));
		}

		debug(cacheControlInfo);
		if (cacheControlInfo['s-maxage']) {
			return callback(null, parseInt(cacheControlInfo['s-maxage']) * 1000);
		}
	}
	else if (res.get('expires')) {
		var now = new Date();
		return callback(null, new Date(res.get('expires')).getTime() - now.getTime());
	}
	else {
		callback(new Error("Could not get TTL via headers"));
	}
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
 * @param {boolean} result
 */

/**
 * An error first callback, string result
 * @callback crispHttpCache~errFirstCallbackString
 * @param {Error} err
 * @param {string} result
 */

/**
 * An error first callback, int result
 * @callback crispHttpCache~errFirstCallbackInt
 * @param {Error} err
 * @param {int} result
 */

