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
  },
  content: ''
};

var transport = sip.makeTransport({}, function(m, remote) {
  assert.deepEqual(m,msg);
  assert.deepEqual(remote, {protocol:'TCP', address: sendSocket.address().address, port: sendSocket.address().port});
  transport.destroy();
  sendSocket.end();
  util.print('PASSED\n');
});

var sendSocket = net.createConnection(5060);
sendSocket.on('connect', function() {
  sendSocket.write(sip.stringify(msg));
});

