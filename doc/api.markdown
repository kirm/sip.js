SIP.js API
==========

sip.js is a simple SIP protocol implementation.

It features:

* SIP Message Parser
* UDP, TCP and TLS based transport
* Transactions
* Digest Authentication

Example
--------------------

Redirecting all SIP requests to backup.somewhere.net

    var sip = require('sip');
  
    sip.start({}, function(request) {
      var response = sip.makeResponse(request, 302, 'Moved Temporarily');

      var uri = sip.parseUri(request.uri);
      uri.host = 'backup.somewhere.net'; 
      response.headers.contact = [{uri: uri}];
    
      sip.send(response);
    });

Messages
---------

Parsed SIP messages are javascript objects. Message

    INVITE sip:service@172.16.2.2:5060 SIP/2.0
    Via: SIP/2.0/UDP 127.0.1.1:5060;branch=z9hG4bK-1075-1-0
    From: sipp <sip:sipp@127.0.1.1:5060>;tag=1075SIPpTag001
    To: sut <sip:service@172.16.2.2:5060>
    Call-ID: 1-1075@127.0.1.1
    CSeq: 1 INVITE
    Contact: sip:sipp@127.0.1.1:5060
    Max-Forwards: 70
    Subject: Performance Test
    Content-Type: application/sdp
    Content-Length:   127

    v=0
    o=user1 53655765 2353687637 IN IP4 127.0.1.1
    s=-
    c=IN IP4 127.0.1.1
    t=0 0
    m=audio 6000 RTP/AVP 0
    a=rtpmap:0 PCMU/8000
    
is parsed to following object

    { method: 'INVITE'
    , uri: 'sip:service@172.16.2.2:5060'
    , version: '2.0'
    , headers: 
       { via: 
          [ { version: '2.0'
            , protocol: 'UDP'
            , host: '127.0.1.1'
            , port: 5060
            , params: { branch: 'z9hG4bK-1075-1-0' }
            }
          ]
       , from: 
          { name: 'sipp'
          , uri: 'sip:sipp@127.0.1.1:5060'
          , params: { tag: '1075SIPpTag001' }
          }
       , to: 
          { name: 'sut'
          , uri: 'sip:service@172.16.2.2:5060'
          , params: {}
          }
       , 'call-id': '1-1075@127.0.1.1'
       , cseq: { seq: 1, method: 'INVITE' }
       , contact: 
          [ { name: undefined
            , uri: 'sip:sipp@127.0.1.1:5060'
            , params: {}
            }
          ]
       , 'max-forwards': '70'
       , subject: 'Performance Test'
       , 'content-type': 'application/sdp'
       , 'content-length': 127
       }
    , content: 'v=0\r\no=user1 53655765 2353687637 IN IP4 127.0.1.1\r\ns=-\r\nc=IN IP4 127.0.1.1\r\nt=0 0\r\nm=audio 6000 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000'
    }    

SIP requests have `method` and `uri` properties and responses have `status` and `reason` instead.

## High Level API

### sip.start(options, onRequest)

Starts SIP protocol. 

`options` - an object optionally containing following properties. 

* `port` - port to be used by UDP and TCP transports. 5060 by default.
* `address` - interface address to be listen on. By default sip.js listens on all interfaces.
* `udp` - enables UDP transport. Enabled by default.
* `tcp` - enables TCP transport. Enabled by default.
* `tls` - options object for tls transport. It will be passed as options parameter to `tls.createServer` and
  `tls.connect` node.js APIs. See [description in node.js API documentation](http://nodejs.org/api/tls.html#tls_tls_createserver_options_secureconnectionlistener).
  If `tls' is ommited TLS transport will be disabled.
* `tls_port` - port for TLS transport to listen on. 5061 by default.
* `publicAddress`, `hostname` - address and hostname to be used within sip.js generated local uris and via headers. Sip.js will use `options.publicAddress` when
  it's defined, then fallback to `options.hostname` and the fallback to value returned by node.js `os.hostname()` API.
* `ws_port` - port for WebSockets transport. To enable WebSockets transport, this field is required; no default provided.


`onRequest` - callback to be called on new request arrival. It is expected to be a function of two arguments
`function (request, remote) {}`. First argument `request` is a received request. Second argument `remote` is an object containing
protocol, address and port of a remote socket used to send the request. For example
`{ protocol: 'TCP', address: '192.168.135.11', port: 50231 }`

### sip.stop

Stops SIP protocol.

### sip.send(message[, callback])

Sends SIP message transactionally.

If `message` is an non-`'ACK'` request then client transaction is created. Non-`'ACK'` requests are passed directy to transport layer.

If `message` is a response then server transaction is looked up and passed the message. There is no special handling of success
responses to `'INVITE'` requests. It is not necessary because in sip.js `'INVITE'` server transactions are not destroyed on 2xx responses 
but kept around for another 32 seconds (as per RFC 6026). Applications still need to resend success `'INVITE'` responses. 

## Helper Functions

### sip.makeResponse(request, status[, reason])

returns SIP response object for `request` with `status` and `reason` fields set.

### sip.parseUri(uri)

parses SIP uri.

### sip.stringifyUri(uri)

stringifies SIP uri.

### sip.parse(message)

parses SIP message.

### sip.stringify(message)

stringfies SIP message.

### sip.copyMessage(message[, deep])

copies SIP message. If parameter `deep` is false or omitted it copies only `method`, `uri`, `status`, `reason`, `headers`, `content` 
fields of root object and `headers.via` array. If deep is true it performs full recursive copy of message object.

## Digest Authentication

sip.js implements digest authentication as described in RFC 2617. Module can be accessed by calling `require('sip/digest');`

### Server-side API

#### digest.challenge(session, response)

inserts digest challenge ('WWW-Authethicate' or 'Proxy-Authenticate' headers) into response and returns it. `session` parameter
is a javascript object containing at least `realm` property. On return it will contain session parameters (nonce, nonce-count etc)
and should be passed to subsequent `authenticateRequest` calls. It is a plain object containing only numbers and strings and can be
'jsoned' and saved to database if required.

#### digest.authenticateRequest(session, request[, credentials])

returns `true` if request is signed using supplied challenge and credentials. `credentials` required only on first call to generate `ha1` value 
which is cached in `session` object. `credentials` is an object containing following properties:

* `user` - user's account name
* `realm` - protection realm name. optinal, should match realm passed in corresponding `challenge` call.
* `password` - user's password. optional if `hash` property is present.
* `hash` - hash of user's name, password and protection realm. Optional if `password` is present. Can be obtained by calling 
  `digest.calculateUserRealmPasswordHash` and used if you don't want to store passwords as clear text.

#### digest.signResponse(session, response)

inserts 'Authentication-Info' header into response. Used for mutual client-server authentication.

### Client-side API

### digest.signRequest(session, request[, response, credentials])

inserts 'Authorization' or 'Proxy-Authorization' headers into request and returns it. To initialize the session after server challenge reception,
supply `response` (must be 401 or 407 response containing server challenge) and `credentials`. `credentials` parameter described in 
`digest.authenticateRequest` description.

### digest.authenticateResponse(session, response)

checks server signature in 'Authentication-Info' parameter. Returns `true` if signature is valid, `false` if invalid and `undefined` if no 'Authentication-Info'
header present or it lacks `rspauth` parameter. If server supplied `nextnonce` parameter reinitializes `session`. 

### Low level functions

#### digest.calculateDigest(arguments)

calculates digest as described in RFC 2617. `arguments` is an object with following properties

* `ha1`
* `nonce`
* `nc`
* `cnonce`
* `qop`
* `method`
* `uri`
* `entity`

#### digest.calculateHA1(arguments)

calculates H(A1) value as described if RFC 2617. `arguments` is an object with followin properties

* `userhash` - hash of user's name, realm and password. Optional if `user`, `realm` and `password` properties are present
* `user` - user's name. Optional if `userhash` is present.
* `realm` - realm name. Optional if `userhash` is present.
* `password` - user's password in realm. Optional if `userhash` is present.
* `algorithm` - authentication algorithm. Optional, by default used value `md5`.
* `nonce` - server's nonce parameter. Optional if `algorithm` is _not_ equal to `md5-sess`
* `cnonce` - client's nonce. Optional if `algorithm` is _not_ equal to `md5-sess`

#### digest.calculateUserRealmPasswordHash(user, realm, password)

calculates hash of 'user:realm:password'

## Proxy Module

sip.js includes proxy module to simplify proxy server development. It can be accessed via `require('sip/proxy');`
Usage example:

    var sip = require('sip');
    var proxy = require('sip/proxy');
    var db = require('userdb');

    proxy.start({}, function(rq) {
      var user = sip.parseUri(rq.uri).user;

      if(user) {
        rq.uri = db.getContact(user);

        proxy.send(rq);
      }
      else
        proxy.send(sip.makeResponse(rq, 404, 'Not Found')); 
    });


### proxy.start(options, onRequest)

Starts proxy and SIP stack. Parameters are analogous to `sip.start`

### proxy.stop

stops proxy core and sip stack.

### proxy.send(msg[, callback])

Use this function to respond to or to make new requests in context of incoming requests. Proxy core will
automatically handle cancelling of incoming request and issue `CANCEL` requests for outstanding requests on your
behalf. Outgoing requests are bound to context through their top via header.
If you are sending a request and omit `callback` parameter, default calback will be used:

    function defaultProxyCallback(rs) {
      // stripping top Via
      rs.headers.via.shift();

      // sending response to original incoming request
      proxy.send(rs);
    } 



