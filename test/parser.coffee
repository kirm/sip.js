assert = require('assert')
sip = require('../sip')
fs = require('fs')

# check correct parsing of most of specifically parsed headers
# ie contact is parsed to array, to parsed to single valued headers etc
test1 = (success) ->
  m = sip.parse [
    'INVITE sip:bob@biloxi.com SIP/2.0',
    'Via: SIP/2.0/UDP pc33.atlanta.com;branch=z9hG4bK776asdhds',
    'Max-Forwards: 70',
    'To: Bob <sip:bob@biloxi.com>',
    'From: Alice <sip:alice@atlanta.com>;tag=1928301774',
    'Call-ID: a84b4c76e66710@pc33.atlanta.com',
    'CSeq: 314159 INVITE',
    'Contact: <sip:alice@pc33.atlanta.com>',
    'Content-Type: application/sdp',
    'Content-Length: 142',
    'Authorization: Digest username="Alice", realm="atlanta.com", nonce="84a4cc6f3082121f32b42a2187831a9e", response="7587245234b3434cc3412213e5f113a5432"',
    'Proxy-Authorization: Digest username="Alice", realm="atlanta.com", nonce="84a4cc6f3082121f32b42a2187831a9e", response="7587245234b3434cc3412213e5f113a5432"',
    'WWW-Authenticate: Digest realm="atlanta.com", nonce="84a4cc6f3082121f32b42a2187831a9e"',
    'Authentication-Info: nextnonce="1234"',
    'Refer-To: sip:100@somewhere.net',
    '\r\n'].join('\r\n')

  m2 =
    method: 'INVITE'
    uri: 'sip:bob@biloxi.com'
    version: '2.0'
    headers:
      via: [{version: '2.0', protocol: 'UDP', host: 'pc33.atlanta.com', port: undefined, params:{branch: 'z9hG4bK776asdhds'}}]
      'max-forwards': '70'
      to: {name: 'Bob', uri: 'sip:bob@biloxi.com', params: {}}
      from: {name: 'Alice', uri: 'sip:alice@atlanta.com', params: {tag: '1928301774'}}
      'call-id': 'a84b4c76e66710@pc33.atlanta.com'
      cseq: {seq: 314159, method: 'INVITE'}
      contact: [{name: undefined, uri: 'sip:alice@pc33.atlanta.com', params: {}}]
      'content-type': 'application/sdp'
      'content-length': 142
      authorization: [
        scheme: 'Digest'
        username: '"Alice"'
        realm: '"atlanta.com"'
        nonce: '"84a4cc6f3082121f32b42a2187831a9e"'
        response: '"7587245234b3434cc3412213e5f113a5432"'
      ]
      'proxy-authorization': [
        scheme: 'Digest'
        username: '"Alice"'
        realm: '"atlanta.com"'
        nonce: '"84a4cc6f3082121f32b42a2187831a9e"'
        response: '"7587245234b3434cc3412213e5f113a5432"'
      ]
      'www-authenticate': [
        scheme: 'Digest'
        realm: '"atlanta.com"'
        nonce: '"84a4cc6f3082121f32b42a2187831a9e"'
      ]
      'authentication-info': {nextnonce: '"1234"'}
      'refer-to': {name: undefined, uri: 'sip:100@somewhere.net', params: {}}
    content: ''

  assert.deepEqual m, m2

  success()

#sip parser torture tests
test2 = (success) ->
  # FIXME: 'intmeth', 'unreason' - fails
  messages = ['wsinv', 'esc01', 'escnull', 'esc02', 'lwsdisp', 'longreq', 'dblreq', 'semiuri', 'transports', 'mpart01', 'noreason', 'intmeth', 'unreason']

  messages.forEach (name) ->
    # console.log "# processing '#{name}'" # XXX
    m = fs.readFileSync "#{__dirname}/messages/#{ name }.dat", 'ascii'
    p = fs.readFileSync "#{__dirname}/messages/#{ name }.json", 'ascii'

    assert.deepEqual (JSON.parse JSON.stringify sip.parse m), (JSON.parse p)
    
  success()

exports.tests = [test1, test2]
