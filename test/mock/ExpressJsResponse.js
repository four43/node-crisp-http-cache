function ExpressJsResponse(options) {
	if(options === undefined) {
		options = {};
	}
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

ExpressJsResponse.prototype.set = function(name, value) {
	this._headers[name.toLowerCase()] = value;
	return this;
};

module.exports = ExpressJsResponse;