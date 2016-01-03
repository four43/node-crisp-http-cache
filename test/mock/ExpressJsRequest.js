var accepts = require('accepts');

function ExpressJsRequest(options) {
	this.headers = {};
	if(options.headers) {
		Object.keys(options.headers).map(function(header) {
			this.headers[header.toLowerCase()] = options.headers[header];
		}.bind(this));
	}
}

ExpressJsRequest.prototype.get = function(header) {
	return this.headers[header.toLowerCase()];
};

ExpressJsRequest.prototype.accepts = function(){
	var accept = accepts(this);
	return accept.types.apply(accept, arguments);
};

ExpressJsRequest.prototype.acceptsCharsets = function(){
	var accept = accepts(this);
	return accept.charsets.apply(accept, arguments);
};

ExpressJsRequest.prototype.acceptsEncodings = function(){
	var accept = accepts(this);
	return accept.encodings.apply(accept, arguments);
};

ExpressJsRequest.prototype.acceptsLanguages = function(){
	var accept = accepts(this);
	return accept.languages.apply(accept, arguments);
};

module.exports = ExpressJsRequest;