function ExpressJsResponse(options) {
	this.statusCode = options.statusCode || 200;

	this._headers = {};
	if(options.headers) {
		Object.keys(options.headers).map(function(header) {
			this._headers[header.toLowerCase()] = options.headers[header];
		}.bind(this));
	}
}

ExpressJsResponse.prototype.get = function(header) {
	return this._headers[header.toLowerCase()];
};

module.exports = ExpressJsResponse;