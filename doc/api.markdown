SIP.js API
==========

sip.js is a simple SIP protocol implementation.

It features:

* SIP Message Parser
* UDP and TCP based transport
* Transaction

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

* `port` - port to be used by trasport. 5060 by default.
* `address` - interface address to be listen on. By default sip.js listens on all interfaces.
* `udp` - enables UDP transport. Enabled by default.
* `tcp` - enables TCP transport. Enabled by default.

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

