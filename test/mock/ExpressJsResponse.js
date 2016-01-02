function ExpressJsResponse(options) {
	this.statusCode = options.statusCode || 200;
	this._headers = options.headers;
}

ExpressJsResponse.prototype.get = function(header) {
	return this._headers[header.toLowerCase()];
};

module.exports = ExpressJsResponse;