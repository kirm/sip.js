var sip = require('../sip.js');
var assert = require('assert');
var udp = require('../udp.js');
var util = require('util');
var net = require('net');

var msg = {
  uri: 'sip:test',
  method: 'OPTIONS',
  version: "2.0",
  headers: {
    via: [{version: "2.0", protocol: 'TCP', host: 'localhost', port: 5060, params: {branch:'12345'}}],
    'content-length': 0,
    to: {name: 'a', uri:"uri", params:{v:1}},
    from: {name: 'a', uri:"uri", params:{}},
    'call-id': '12345',
    cseq: {method: 'OPTIONS', seq: 1}
  },
  content: ''
};

var resp = sip.makeResponse(msg, 404);
resp.headers['content-length'] = 0;
resp.content='';
resp.reason = 'not found'

var transport = sip.makeTransport({}, function(m, remote) {
  assert.deepEqual(m,msg);
  assert.deepEqual(remote, {protocol:'TCP', address: sendSocket.address().address, port: sendSocket.address().port});
  transport.send(remote, resp);
});

var sendSocket = net.createConnection(5060);
sendSocket.on('connect', function() {
  sendSocket.write(sip.stringify(msg), 'ascii');
});

sendSocket.setEncoding('ascii');

sendSocket.on('data', sip.makeStreamParser(function(m) {
  assert.deepEqual(m.headers, resp.headers);
  assert.deepEqual(m, resp);
})) 

sendSocket.on('end', function() {
  sendSocket.end();
  transport.destroy();
  util.print('PASSED\n');
});
