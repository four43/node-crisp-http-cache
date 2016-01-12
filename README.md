# node-crisp-http-cache
Middleware providing a crispy fresh cache for HTTP responses. This cache adheres to best practices for caching HTTP requests similarly to what you would see implemented in a CDN or a proxy server. crisp-http-cache is best used in dynamic environments (since ETags still require processing), a microservice architecture, or where an HTTP Cache like a full on CDN would be overly complex or expensive.

Master Build Status: 
[![Build Status](https://travis-ci.org/four43/node-crisp-http-cache.svg?branch=master)](https://travis-ci.org/four43/node-crisp-http-cache)
[![Coverage Status](https://coveralls.io/repos/four43/node-crisp-http-cache/badge.svg?branch=master&service=github)](https://coveralls.io/github/four43/node-crisp-http-cache?branch=master)

> There are only two hard things in Computer Science: cache invalidation and naming things.
>  
>  -- Phil Karlton

## Caching Theory

Caching helps in all scenarios if done properly, but that last part is the kicker. There are a few prominent scenarios:

1. **Known Expiration** - 
In this scenario you are usually dealing with time sensitive data and will want to cache accordingly. You know when data will be updated and can explicitly set your cached data to expire.

2. **Unknown Expiration** - 
This scenario is a little more difficult, as it requires guessing. Those guesses can be fairly intelligent, if you look at your use case. A lot of non dynamic content will fall into this category. You know you will want to update your content at some point, but aren't exactly sure on when. So you will need to balance performance and freshness and decide on an interval.

3. **Never Expires** - 
If you have content that is a fixed resource that you know will never change and should remain active forever, you may set that resource to be cached for 1 year. This should be used very conservatively as many resources may be edited or removed, think DMCA takedown requests, or users want to go back and delete uploaded content. Few things are forever.

## Examples

In all cases we will serve content to consumers with the best indication of expiration. This includes returning 304s and not re-serving content, where available.

#### Known Expiration
Simply set the "expires" headers on your content and install `crisp-http-cache` as middleware. Expiration headers will be sent to the client to expire at the specified time, `crisp-cache` will hold the resource, using "expires" as an indication of expiry TTL.

(Set expires to be a little after, set stale to expires header)

#### Unknown Expiration
An unknown expiration is best dealt with using "stale" data. You can serve some (potentially) stale content to a user immediately, but then verify what was sent is current for subsequent requests. This will keep your application balanced between being responsive and up to date.

(No headers required, just set an interval, cache variance, stale more often than expires)

#### Never Expires
Set the "expires" header to the Javascript constant "Infinity" to tell `crisp-http-cache` to never expire. `crisp-http-cache` will automatically convert headers to comply with the recommended spec of 1 year. It will also cache the entry in `crisp-cache` to last forever (unless otherwise specified) so it can be served quickly.


## Reference

* W3C Spec: https://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html
* Heroku Recommendations: https://devcenter.heroku.com/articles/increasing-application-performance-with-http-cache-headers

## Todo
Send cache-control - Enables caching, must send

Should Send Expires - Browser will not check resource over network until after expires

Send last-modified