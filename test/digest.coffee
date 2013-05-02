sip = require '../sip'
digest = require '../digest'
assert = require 'assert'
util = require 'util'

## testing digest calculation againts example from rfc 2617
test1 = (success) ->
  realm = 'testrealm@host.com'
  nonce = 'dcd98b7102dd2f0e8b11d0f600bfb0c093'
  opaque= '5ccc069c403ebaf9f0171e9517f40e41'
  cnonce = '0a4f113b'
  ha1 = digest.calculateHA1({user:'Mufasa', realm: realm, password: 'Circle Of Life'});
  assert.ok (digest.calculateDigest {
      ha1:ha1,
      method:'GET',
      nonce:nonce,
      nc:'00000001',
      cnonce:cnonce, 
      qop:'auth',
      uri:'/dir/index.html'
    }) == '6629fae49393a05397450978507c4ef1'
  
  success()

test2 = (success) ->
  rq = 
    method: 'OPTIONS' 
    uri: 'sip:carol@chicago.com'
    headers:
      via: {host: 'pc33.atlanta.com', params: {branch: 'z9hG4bKhjhs8ass877'}}
      to: {uri: 'sip:carol@chicago.com'}
      from: {name: 'Alice', uri:'sip:alice@atlanta.com', params: {tag:'1928301774'}}
      'call-id': 'a84b4c76e66710'
      cseq: {seq: 63104, method: 'OPTIONS'}
      contact: [{uri: 'sip:alice@pc33.atlanta.com'}]
      accept: 'application/sdp'
      'content-length': 0

  server = {realm: 'test'}
  rs = digest.challenge server, sip.makeResponse rq, 401, 'Authentication Required'

  assert.ok rs.headers['www-authenticate'], "www-authenticate header not present"
  
  client = {}
  rq = digest.signRequest client, rq, rs, {user:'carol', password: '1234'}
 
  assert.ok digest.authenticateRequest server, rq, {user: 'carol', password: '1234'}
  assert.ok digest.authenticateResponse client, digest.signResponse server, sip.makeResponse rq, 200

  rq = digest.signRequest client, rq
  
  assert.ok digest.authenticateRequest server, rq
  assert.ok digest.authenticateResponse client, digest.signResponse server, sip.makeResponse rq, 200

  success()

test3 = (success) ->
  rq = 
    method: 'OPTIONS' 
    uri: 'sip:carol@chicago.com'
    headers:
      via: {host: 'pc33.atlanta.com', params: {branch: 'z9hG4bKhjhs8ass877'}}
      to: {uri: 'sip:carol@chicago.com'}
      from: {name: 'Alice', uri:'sip:alice@atlanta.com', params: {tag:'1928301774'}}
      'call-id': 'a84b4c76e66710'
      cseq: {seq: 63104, method: 'OPTIONS'}
      contact: [{uri: 'sip:alice@pc33.atlanta.com'}]
      accept: 'application/sdp'
      'content-length': 0

  server = {realm: 'test'}
  rs = digest.challenge server, sip.makeResponse rq, 407, 'Proxy Authentication Required'

  assert.ok rs.headers['proxy-authenticate'], "proxy-authenticate header not present"
  
  client = {}
  rq = digest.signRequest client, rq, rs, {user:'carol', password: '1234'}
 
  assert.ok digest.authenticateRequest server, rq, {user: 'carol', password: '1234'}

  rq = digest.signRequest client, rq
  
  assert.ok digest.authenticateRequest server, rq

  success()

test4 = (success) ->
  assert.ok (new Date() - digest.extractNonceTimestamp(digest.generateNonce('1234'), '1234')) < 1000, 'timestamped nonce fail'
  success() 

exports.tests = [test1, test2, test3, test4]
 
 
