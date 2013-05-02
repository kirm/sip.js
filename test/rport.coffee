sip = require('../sip')
udp = require('dgram')
assert = require('assert')
util = require('util')

sip.start rport: true, (rq) -> sip.send sip.makeResponse rq, 500

socket = udp.createSocket 'udp4'

socket.bind 6060

message = 
  method: 'OPTIONS'
  uri: 'sip:127.0.0.1:6060;transport=udp'
  headers:
    cseq: {method: 'OPTIONS', seq:1}
    'call-id': 'hrbtch'
    to: {uri: 'sip:test@127.0.0.1'}
    from: {uri: 'sip:test@127.0.0.1'}

test1 = (success) ->
  socket.once 'message', (msg, rinfo) ->
    parsed = sip.parse msg
    assert.ok parsed.headers.via[0].params.hasOwnProperty('rport') 
    rs = sip.stringify sip.makeResponse (sip.parse msg), 200
    socket.send (new Buffer rs), 0, rs.length, rinfo.port, rinfo.address

  sip.send sip.copyMessage(message), (rs) -> 
    assert.equal 200, rs.status
    success()

test2 = (success) ->
  socket.once 'message', (msg, rinfo) ->
    parsed = sip.parse msg
    rs = sip.stringify sip.makeResponse parsed, 200
    socket.send (new Buffer rs), 0, rs.length, parsed.headers.via[0].port, rinfo.address
    
  sip.send message,
    (rs) -> 
      assert.equal 200, rs.status
      success()

test3 = (success) -> 
  sip.stop()
  sip.start rport: false, (rq) -> sip.send sip.makeResponse rq, 500

  socket.once 'message', (msg, rinfo) ->
    parsed = sip.parse msg
    assert.ok !parsed.headers.via[0].params.hasOwnProperty('rport')
    rs = sip.stringify sip.makeResponse (sip.parse msg), 200
    socket.send (new Buffer rs), 0, rs.length, rinfo.port, rinfo.address

  sip.send sip.copyMessage(message), () -> success()

exports.tests = [test1, test2, test3]
 
