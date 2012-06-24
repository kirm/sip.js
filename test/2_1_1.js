var sip = require('../sip.js');
var assert = require('assert');
var udp = require('../udp.js');
var util = require('util');

var msg = {
  uri: 'sip:test',
  method: 'OPTIONS',
  version: "2.0",
  headers: {
    via: [{version: "2.0", protocol: 'UDP', host: 'localhost', port: 5060, params: {branch:'12345'}}],
  },
  content: ''
};

var transport = sip.makeTransport({}, function(m, remote) {
  assert.deepEqual(m,msg);
  assert.deepEqual(remote, {protocol:'UDP', address: sendSocket.address().address, port: sendSocket.address().port});
  transport.destroy();
  sendSocket.close();
  util.print('PASSED\n');
});

var sendSocket = udp.createSocket();
var s = sip.stringify(msg);

sendSocket.connect(5060);
sendSocket.send(new Buffer(s), 0, s.length);

