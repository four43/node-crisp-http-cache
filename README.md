# node-crisp-http-cache
Middleware providing a crispy fresh cache for HTTP responses. This cache adheres to best practices for caching HTTP requests similarly to what you would see implemented in a CDN or a proxy server. crisp-http-cache is best used in dynamic environments (since ETags still require processing), a microservice architecture, or where an HTTP Cache like a full on CDN would be overly complex or expensive. It is an LRU cache under the hood thanks to [crisp-cache](https://github.com/four43/node-crisp-cache) that will evict old entries once it gets to a specified size.

Master Build Status: 
[![Build Status](https://travis-ci.org/four43/node-crisp-http-cache.svg?branch=master)](https://travis-ci.org/four43/node-crisp-http-cache)
[![Coverage Status](https://coveralls.io/repos/four43/node-crisp-http-cache/badge.svg?branch=master&service=github)](https://coveralls.io/github/four43/node-crisp-http-cache?branch=master)

> There are only two hard things in Computer Science: cache invalidation and naming things.
>  
>  -- Phil Karlton

## Quick Example

This will cache the response for 30 seconds, as described by the expires header. 

```javascript
// Express.js Web Server
var app = require('express')(),
    CrispHttpCache = require('crisp-http-cache');

var cache = new CrispHttpCache({
   cacheOptions: {
       maxSize: 50
   }
});
app.use(cache.getExpressMiddleware());

app.get('/hello', function (req, res) {
    res.set('expires', new Date(Date.now() + 30000).toUTCString());
    res.send("Hello! " + (new Date).toISOString());
});

var listener = app.listen(9001, function() {
	console.log('Demo Server (with caching) started on port ' + listener.address().port);
});
```

`crisp-http-cache` is an HTTP caching middleware that determines it's TTL based on standard HTTP headers, so it will transform our `expires` header response into a 30 second TTL and will also set the `cache-control` header, as per HTTP recommendation. 

## Options

`crisp-http-cache` should be instantiated and the following options can be passed in an object to configure the cache. The middleware can be accessed by calling the getter corresponding to your desired framework.

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `enabled` | (boolean) | `true` | A master switch of if we should cache or not, useful to set this to `false` while debugging. |
| `shouldCache` | (callable) | return true; | An async function that should resolve with a boolean, `function(req, res, cb)` |
| `getKey` | (callable) | "Use original req URL as key" | An async function that should resolve with a string key based on the request/response, `function(req, res, cb)` |
| `getTtl` | (callable) | "Get from headers" | An async function that resolves with an integer for the TTL of response, `function(req, res, cb)` |
| `compareCache` | (callable) | "Use Headers to make sure this entry applies to request" | An async function that resolves with boolean if the cached version matches the request, `function(req, res, cb)` |
| `cacheClientMatch` | (callable) | "Check ETag" | An async function that resolves with a boolean if the cached version is the exact version the client is requesting, `function(req, res, cb)`
| `transformHeaders`  | (callable) | "Normalize" | A callable that can modify headers before sending, `function(res, estExpiresInterval)` |
| `cacheOptions` | (object) | `{}` | Caching options sent directly to [crisp-cache](https://github.com/four43/node-crisp-cache) See below. |

#### cacheOptions - More In Depth

The full set of [crisp-cache options](https://github.com/four43/node-crisp-cache) is available except those related to fetching. Due to the cost of creating simulated requests and data integrity issues due to making subsequent requests, we won't be fetching anything automatically. Some of the most relevant options:

* `maxSize` (integer, bytes) - The size in bytes that the cache shouldn't exceed. Cache entries are the size of the full response, res.body.default
* `evictCheckInterval` (integer, ms) - Will check for expired cache entries and delete them from the cache.
* `events` (object) - Configurable event object, useful for stats and debugging.

## Caching Theory

Caching helps in all scenarios if done properly, but that last part is the kicker. There are a few prominent scenarios:

1. **Known Expiration** - 
In this scenario you are usually dealing with time sensitive data and will want to cache accordingly. You know when data will be updated and can explicitly set your cached data to expire.

2. **Unknown Expiration** - 
This scenario is a little more difficult, as it requires guessing. Those guesses can be fairly intelligent, if you look at your use case. A lot of non dynamic content will fall into this category. You know you will want to update your content at some point, but aren't exactly sure on when. So you will need to balance performance and freshness and decide on an interval.

3. **Never Expires** - 
If you have content that is a fixed resource that you know will never change and should remain active forever, you may set that resource to be cached for 1 year. This should be used very conservatively as many resources may be edited or removed, think DMCA takedown requests, or users want to go back and delete uploaded content. Few things are forever.

4. **Never Cache** -
Constantly changing data or data that is private shouldn't be cached.

### Examples

In all cases we will serve content to consumers with the best indication of expiration. This includes returning 304s and not re-serving content, where available.

#### Known Expiration
Simply set the "expires" headers on your content and install `crisp-http-cache` as middleware. Expiration headers will be sent to the client to expire at the specified time, `crisp-cache` will hold the resource, using "expires" as an indication of expiry TTL.

(Set expires to be a little after, set stale to expires header)

#### Unknown Expiration
An unknown expiration is best dealt with using "stale" data. You can serve some (potentially) stale content to a user immediately, but then verify what was sent is current for subsequent requests. This will keep your application balanced between being responsive and up to date.

(No headers required, just set an interval, cache variance, stale more often than expires)

#### Never Expires
Set the "expires" header to the Javascript constant "Infinity" to tell `crisp-http-cache` to never expire. `crisp-http-cache` will automatically convert headers to comply with the recommended spec of 1 year. It will also cache the entry in `crisp-cache` to last forever (unless otherwise specified) so it can be served quickly.

#### Never Cache
Fairly easy, set the expires header to 0.


## Reference

* W3C Spec: https://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html
* Heroku Recommendations: https://devcenter.heroku.com/articles/increasing-application-performance-with-http-cache-headers

## Todo
Send cache-control - Enables caching, must send

Should Send Expires - Browser will not check resource over network until after expires

Send last-modified