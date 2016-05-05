var util = require('util');

function CrispHttpCacheError(message) {
	Error.apply(this, arguments);
	Error.captureStackTrace(this, CrispHttpCacheError);
	this.message = "CrispHttpCache - " + message;
}
util.inherits(CrispHttpCacheError, Error);

module.exports = CrispHttpCacheError;
